// sw.js - Service Worker for caching language files and images
// Implements offline caching and intelligent cache management

// Build-time injectable version — replace via sed/string-replace in CI or a bundler plugin.
// When no injection happens, falls back to a dev-friendly default.
const SW_VERSION = typeof __SW_VERSION__ !== 'undefined' ? __SW_VERSION__ : '0.0.0';

const CACHE_NAME = `language-cache-v${SW_VERSION}`;
const LANGUAGE_FILES_CACHE = `language-files-v${SW_VERSION}`;

// ─── 图片缓存配置 ──────────────────────────────────────────────────────────────
const IMAGE_CACHE = 'image-cache-v0-0-4';
// 本地图片（/images/*.png、*.webp）使用 Cache First，命中直接返回，无则网络请求后写缓存
// 外链图片（百度图床、证书图等）使用 Stale-While-Revalidate：先返回缓存，后台异步更新
const LOCAL_IMAGE_PATTERN = /^\/images\/.*\.(png|webp|jpg|jpeg|gif|svg)$/i;
const EXTERNAL_IMAGE_ORIGINS = [
  'img0.baidu.com',
  'img1.baidu.com',
  'img2.baidu.com',
  'img3.baidu.com',
  'liuzhoume.com',
  'images.unsplash.com',
];
// 图片缓存最大条目数（防止磁盘占用失控）
const IMAGE_CACHE_MAX_ENTRIES = 200;

// UI translation files (small, ~16KB each) — cached on install for instant first render
// Product translation files (large, ~130KB each) — cached on first use
//
// Full list of supported UI language files (for reference):
// zh-CN-ui, zh-TW-ui, en-ui, ar-ui, he-ui, de-ui, es-ui, fr-ui, it-ui, nl-ui,
// pl-ui, pt-ui, ru-ui, tr-ui, ja-ui, ko-ui, id-ui, ms-ui, fil-ui, th-ui,
// vi-ui, hi-ui, my-ui, km-ui, lo-ui

// Install-time pre-cache: only default languages (zh-CN + en).
// Other languages are written to cache on first use via the existing
// cacheLanguageFile message handler, keeping SW install fast (~30 KB vs ~375 KB).
const INSTALL_LANGUAGE_FILES = [
  './assets/lang/zh-CN-ui.json',
  './assets/lang/en-ui.json',
];

// Keep a flat list for install-time pre-caching (UI files only — fast to cache)
const LANGUAGE_FILES = INSTALL_LANGUAGE_FILES;

// Install event - cache language files
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');

  event.waitUntil(
    caches.open(LANGUAGE_FILES_CACHE).then((cache) => {
      console.log('[SW] Caching language files...');
      return cache.addAll(LANGUAGE_FILES).then(() => {
        console.log('[SW] All language files cached successfully');
      }).catch((error) => {
        console.error('[SW] Failed to cache language files:', error);
        // Cache individually to avoid one failure blocking all
        return Promise.allSettled(
          LANGUAGE_FILES.map(file => {
            return cache.add(file).catch(err => {
              console.warn(`[SW] Failed to cache ${file}:`, err);
            });
          })
        );
      });
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');

  const VALID_CACHES = [LANGUAGE_FILES_CACHE, CACHE_NAME, IMAGE_CACHE];

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!VALID_CACHES.includes(cacheName)) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Service Worker activated');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ── 1. 本地图片：Cache First ───────────────────────────────────────────────
  if (LOCAL_IMAGE_PATTERN.test(url.pathname)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) {
          return cached;
        }
        // 未缓存，从网络拉取并写入缓存
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            // 异步写缓存（不阻塞返回），并维护缓存条目上限
            cache.put(event.request, response.clone()).then(() => trimImageCache(cache));
          }
          return response;
        } catch {
          // 网络失败且无缓存，返回 404
          return new Response('Image not found', { status: 404 });
        }
      })
    );
    return;
  }

  // ── 2. 外链图片：Stale-While-Revalidate ───────────────────────────────────
  if (EXTERNAL_IMAGE_ORIGINS.some(origin => url.hostname.includes(origin))) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);

        // 后台异步更新
        const networkFetch = fetch(event.request)
          .then(response => {
            if (response.ok) {
              cache.put(event.request, response.clone()).then(() => trimImageCache(cache));
            }
            return response;
          })
          .catch(() => null);

        // 有缓存则立即返回，同时后台刷新
        if (cached) {
          return cached;
        }
        // 无缓存则等网络
        return networkFetch || new Response('Image not available offline', { status: 503 });
      })
    );
    return;
  }

  // Handle language file requests
  // Match both absolute (/assets/lang/...) and relative (./assets/lang/...) URL forms
  if ((url.pathname.startsWith('/assets/lang/') || url.pathname.includes('/assets/lang/')) && url.pathname.endsWith('.json')) {
    event.respondWith(
      caches.open(LANGUAGE_FILES_CACHE).then((cache) => {
        // Normalize cache key: strip query string so pre-cached entries always hit
        // (fetch may carry ?ts= or other params that must not create separate cache entries)
        const normalizedRequest = new Request(url.origin + url.pathname, { headers: event.request.headers });

        // Try to get from cache first (ignoreSearch as extra safety net)
        return cache.match(normalizedRequest, { ignoreSearch: true }).then((cachedResponse) => {
          // Stale-While-Revalidate: return cached version immediately while
          // refreshing in the background so users get updates on next visit.
          const networkPromise = fetch(event.request).then((networkResponse) => {
            // Check if we received a valid response
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              console.warn('[SW] Invalid network response for:', url.pathname);
              return networkResponse;
            }

            // Store with normalized key (no query string) to match pre-cached entries
            cache.put(normalizedRequest, networkResponse.clone()).catch(err => {
              console.warn('[SW] Failed to cache language file:', err);
            });

            console.log('[SW] Language file refreshed:', url.pathname);
            return networkResponse;
          });

          if (cachedResponse) {
            console.log('[SW] Serving language file from cache (background refresh):', url.pathname);
            return cachedResponse;
          }

          // Not in cache, wait for network
          console.log('[SW] Fetching language file from network:', url.pathname);
          return networkPromise.catch((error) => {
            console.error('[SW] Network fetch failed, trying fallback:', error);

            // Fallback: try to serve Chinese (zh-CN) ui file as universal fallback
            if (!url.pathname.includes('/zh-CN-ui.json')) {
              const lang = url.pathname.match(/\/([^/]+?)(?:-ui|-product)?\.json$/);
              const fallbackUrl = lang
                ? url.pathname.replace(/\/[^/]+\.json$/, '/zh-CN-ui.json')
                : null;

              if (fallbackUrl) {
                const fallbackRequest = new Request(fallbackUrl, event.request);

                return cache.match(fallbackRequest).then((fallbackResponse) => {
                  if (fallbackResponse) {
                    console.log('[SW] Serving fallback language (zh-CN-ui) from cache');
                    return fallbackResponse;
                  }
                  throw error;
                });
              }
            }

            throw error;
          });
        });
      })
    );
  }
});

// Message event - handle messages from main thread
self.addEventListener('message', (event) => {
  const { type, payload } = event.data;

  switch (type) {
  case 'SKIP_WAITING':
    console.log('[SW] Skip waiting requested');
    self.skipWaiting();
    break;

  case 'CACHE_LANGUAGE':
    console.log('[SW] Cache language requested:', payload.language);
    cacheLanguageFile(payload.language).catch(err => {
      console.error('[SW] Failed to cache language:', err);
    });
    break;

  case 'CLEAR_CACHE':
    console.log('[SW] Clear cache requested');
    clearLanguageCache();
    break;

  case 'GET_CACHE_STATUS':
    getCacheStatus().then(status => {
      event.ports[0].postMessage({ type: 'CACHE_STATUS', payload: status });
    });
    break;

  default:
    console.warn('[SW] Unknown message type:', type);
  }
});

// Helper function to trim image cache to max entries (FIFO)
async function trimImageCache(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length > IMAGE_CACHE_MAX_ENTRIES) {
      // 删除最早的条目
      const toDelete = keys.slice(0, keys.length - IMAGE_CACHE_MAX_ENTRIES);
      await Promise.all(toDelete.map(key => cache.delete(key)));
    }
  } catch (err) {
    console.warn('[SW] Failed to trim image cache:', err);
  }
}

// Helper function to cache UI + product files for a specific language
async function cacheLanguageFile(language) {
  try {
    const cache = await caches.open(LANGUAGE_FILES_CACHE);
    const urls = [
      `/assets/lang/${language}-ui.json`,
      `/assets/lang/${language}-product.json`,
    ];

    const results = await Promise.allSettled(
      urls.map(async (url) => {
        const response = await fetch(url);
        if (response.ok) {
          await cache.put(url, response);
          console.log('[SW] Successfully cached:', url);
          return true;
        }
        return false;
      })
    );

    return results.some(r => r.status === 'fulfilled' && r.value === true);
  } catch (error) {
    console.error('[SW] Error caching language file:', error);
    return false;
  }
}

// Helper function to clear language cache
async function clearLanguageCache() {
  try {
    const cache = await caches.open(LANGUAGE_FILES_CACHE);
    const keys = await cache.keys();
    await Promise.all(keys.map(key => cache.delete(key)));
    console.log('[SW] Language cache cleared');
    return true;
  } catch (error) {
    console.error('[SW] Error clearing language cache:', error);
    return false;
  }
}

// Helper function to get cache status
async function getCacheStatus() {
  try {
    const cache = await caches.open(LANGUAGE_FILES_CACHE);
    const keys = await cache.keys();
    const cachedFiles = keys.map(key => key.url);

    return {
      totalLanguages: LANGUAGE_FILES.length,
      cachedLanguages: cachedFiles.length,
      cachedFiles: cachedFiles.map(file => {
        // Match both {lang}-ui.json and {lang}-product.json formats
        const match = file.match(/\/([^/]+?)(?:-ui|-product)?\.json$/);
        return match ? match[1] : file;
      }),
      cacheSize: keys.reduce((total, key) => {
        // Note: size may not be available in all browsers
        return total + (key.size || 0);
      }, 0)
    };
  } catch (error) {
    console.error('[SW] Error getting cache status:', error);
    return {
      totalLanguages: 0,
      cachedLanguages: 0,
      cachedFiles: [],
      cacheSize: 0
    };
  }
}
