import { PRODUCT_DEFAULTS, PRODUCT_SERIES } from './product-list.js';
import { IMAGE_ASSETS } from './image-assets.js';
import { debounce } from './common.js';

// ─── matchMedia 缓存 ──────────────────────────────────────────────────────────
// 将 window.matchMedia 结果缓存为布尔变量，避免在每次渲染 / 事件回调里重复触发
// 布局计算。通过 'change' 事件保持与实际视口同步。
const _mq768 = window.matchMedia('(max-width: 768px)');
const _mq640 = window.matchMedia('(max-width: 640px)');
const _mq1024 = window.matchMedia('(min-width: 1024px)');
const _mq768min = window.matchMedia('(min-width: 768px)');

/** 视口宽度 ≤ 768px */
let mqMobile = _mq768.matches;
/** 视口宽度 ≤ 640px（手机竖屏轮播） */
let mqMobileSmall = _mq640.matches;
/** 视口宽度 ≥ 1024px */
let mqDesktop = _mq1024.matches;
/** 视口宽度 ≥ 768px（平板以上） */
let mqTablet = _mq768min.matches;

_mq768.addEventListener('change',    (e) => { mqMobile      = e.matches; });
_mq640.addEventListener('change',    (e) => { mqMobileSmall = e.matches; });
_mq1024.addEventListener('change',   (e) => { mqDesktop     = e.matches; });
_mq768min.addEventListener('change', (e) => { mqTablet      = e.matches; });

// utils.js - Shared asset and product helpers

/**
 * 产品分类名 → i18n key 中的 ASCII slug 映射表
 * JSON 文件中对应 key 格式：filter_{slug}
 * 使用 ASCII slug 避免 JSON key 含中文字符，同时支持 data-i18n 属性安全传递
 */
const CATEGORY_SLUG_MAP = {
  '中小型智能炒菜机':  'smart_cooker_mid',
  '其他烹饪设备':      'other_cooking',
  '团餐专用炒菜机':    'catering_cooker',
  '多功能搅拌炒锅':    'mixing_wok',
  '大型商用炒菜机':    'commercial_large',
  '智能全自动炒菜机':  'auto_cooker',
  '智能喷料炒菜机':    'spray_cooker',
  '智能油炸炉系列':    'fryer_series',
  '智能煮面/饭炉系列': 'noodle_rice_series',
  '智能电磁滚筒炒菜机':'drum_induction',
  '智能触屏滚筒炒菜机':'drum_touchscreen',
  '行星搅拌炒菜机':    'planetary_mixer',
};

/**
 * 获取分类名对应的 i18n key（filter_{slug}）
 * 若无映射则 fallback 为 filter_{category}（兼容旧数据）
 */
function getCategoryI18nKey(category) {
  const slug = CATEGORY_SLUG_MAP[category];
  return slug ? `filter_${slug}` : `filter_${category}`;
}

(function attachAppUtils(global) {
  function isProductActive(product) {
    return product?.isActive !== false;
  }

  function resolveImage(imageKey) {
    return IMAGE_ASSETS[imageKey] || '';
  }

  function applyImageAssets(root = document) {
    root.querySelectorAll('[data-image-key]').forEach((img) => {
      const src = resolveImage(img.dataset.imageKey);
      if (src) img.src = src;
    });

    root.querySelectorAll('[data-poster-key]').forEach((video) => {
      const poster = resolveImage(video.dataset.posterKey);
      if (poster) video.poster = poster;
    });

    root.querySelectorAll('[data-bg-image-key]').forEach((el) => {
      const bg = resolveImage(el.dataset.bgImageKey);
      if (bg) el.style.backgroundImage = `url('${bg}')`;
    });
  }

  function buildProductCatalog() {
    let nextId = 1;
    return PRODUCT_SERIES.flatMap((series) =>
      series.products
        .filter(isProductActive)
        .map((product) => {
          const category = series.category;
          const imageKey = product.imageRecognitionKey || `product_${category}`;
          const imageUrl = product.imageUrl || resolveImage(imageKey);
          return {
            ...PRODUCT_DEFAULTS,
            id: nextId++,
            category,
            filterKey: category,
            imageRecognitionKey: imageKey,
            imageKey,
            productImageKey: imageKey,
            imageUrl,
            productImage: imageUrl,
            ...product
          };
        })
    );
  }

  function getSeriesFilters() {
    return PRODUCT_SERIES
      .filter((series) => (series.products || []).some(isProductActive))
      .map((series) => ({
        key: series.category,
        filterKey: getCategoryI18nKey(series.category)
      }));
  }

  global.AppUtils = {
    IMAGE_ASSETS,
    PRODUCT_SERIES,
    resolveImage,
    applyImageAssets,
    buildProductCatalog,
    getSeriesFilters
  };
})(window);

// BEGIN: Extracted page logic from index.html
(function attachPageLogic(global) {
  function tr(key, fallback) {
    const value = typeof window.t === 'function' ? window.t(key) : key;
    return value && value !== key ? value : fallback;
  }

  function getCurrentLanguage() {
    return window.translationManager?.currentLanguage || document.documentElement.lang || 'zh-CN';
  }

  // ============================================
  // 回到顶部按钮系统
  // ============================================
  function setupBackToTopButton() {
    const backToTopBtn = document.getElementById('back-to-top');
    if (!backToTopBtn) return;

    // 初始隐藏按钮
    backToTopBtn.classList.add('hide');

    const checkScrollPosition = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollableHeight = documentHeight - windowHeight;

      // 手机端（< 768px）显示阈值为30%，桌面端为50%
      const isMobile = mqMobile;
      const threshold = isMobile ? 0.3 : 0.5;
      const scrollThreshold = scrollableHeight * threshold;

      if (window.pageYOffset > scrollThreshold) {
        backToTopBtn.classList.remove('hide');
      } else {
        backToTopBtn.classList.add('hide');
      }
    };

    window.addEventListener('scroll', checkScrollPosition, { passive: true });
    window.addEventListener('resize', debounce(checkScrollPosition, 150), { passive: true });
    backToTopBtn.addEventListener('click', function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    checkScrollPosition();
  }

  document.getElementById('language-dropdown')?.addEventListener('click', function (event) {
    event.stopPropagation();
  });

  // ============================================
  // 导航栏滚动高亮系统
  // ============================================
  document.addEventListener('DOMContentLoaded', function () {
    // 初始化翻译系统（来自 translations.js）
    if (typeof window.setupLanguageSystem === 'function') {
      window.setupLanguageSystem();
    }

    // 初始化回到顶部按钮
    setupBackToTopButton();

    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('header nav a[href^="#"]');
    let sectionPositions = [];

    function calculateSectionPositions() {
      sectionPositions = [];
      sections.forEach(section => {
        const rect = section.getBoundingClientRect();
        const scrollY = window.scrollY || window.pageYOffset;
        const offset = 100;
        if (section.id) {
          sectionPositions.push({
            id: section.id,
            top: rect.top + scrollY - offset,
            bottom: rect.top + scrollY + rect.height - offset
          });
        }
      });
      sectionPositions.sort((a, b) => a.top - b.top);
    }

    function updateActiveNavLink() {
      if (sectionPositions.length === 0) return;
      const currentScroll = window.scrollY || window.pageYOffset;
      let currentSection = null;
      for (let i = 0; i < sectionPositions.length; i++) {
        const section = sectionPositions[i];
        if (currentScroll >= section.top && (i === sectionPositions.length - 1 || currentScroll < sectionPositions[i + 1].top)) {
          currentSection = section.id;
          break;
        }
      }
      if (!currentSection && currentScroll > sectionPositions[sectionPositions.length - 1].top) {
        currentSection = sectionPositions[sectionPositions.length - 1].id;
      }

      navLinks.forEach(link => {
        const href = link.getAttribute('href');
        const linkSection = href.startsWith('#') ? href.substring(1) : href;
        if (currentSection === linkSection) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });
    }

    calculateSectionPositions();

    let scrollTimeout;
    window.addEventListener('scroll', function () {
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(updateActiveNavLink, 100);
    });

    window.addEventListener('resize', function () {
      calculateSectionPositions();
      updateActiveNavLink();
    });

    setTimeout(function () {
      calculateSectionPositions();
      updateActiveNavLink();
    }, 100);

    navLinks.forEach(link => {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        if (!targetId.startsWith('#')) return;
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
          navLinks.forEach(l => l.classList.remove('active'));
          this.classList.add('active');
          window.scrollTo({ top: targetElement.offsetTop - 80, behavior: 'smooth' });
          history.pushState(null, null, targetId);
        }
      });
    });

    const mobileNavLinks = document.querySelectorAll('#mobile-menu nav a[href^="#"]');
    mobileNavLinks.forEach(link => {
      link.addEventListener('click', function () {
        setTimeout(() => {
          navLinks.forEach(navLink => {
            if (navLink.getAttribute('href') === this.getAttribute('href')) {
              navLink.classList.add('active');
            } else {
              navLink.classList.remove('active');
            }
          });
        }, 300);
      });
    });
  });

  // ============================================
  // PRODUCT DATA & RENDERING
  // ============================================
  function getAppUtils() {
    return window.AppUtils || null;
  }

  function resolveImage(imageKey) {
    const utils = getAppUtils();
    return utils ? utils.resolveImage(imageKey) : '';
  }

  let products = [];

  function getProducts() {
    if (products.length > 0) return products;

    const utils = getAppUtils();
    if (!utils) return [];

    products = utils.buildProductCatalog();
    return products;
  }

  function renderProductFilters() {
    const filterBar = document.getElementById('product-filter-bar');
    if (!filterBar) return '';

    const utils = getAppUtils();
    const seriesFilters = utils ? utils.getSeriesFilters() : [];
    const defaultFilter = seriesFilters[0]?.key || '';

    filterBar.innerHTML = seriesFilters.map(({ key, filterKey }) => {
      const isActive = key === currentFilter || (!currentFilter && key === defaultFilter);
      const baseClass = 'filter-btn px-5 py-2 rounded-full text-sm font-bold transition-all';
      const stateClass = isActive
        ? 'bg-primary text-white'
        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700';
      const label = tr(filterKey, key);
      return `<button class="${baseClass} ${stateClass}" data-i18n="${filterKey}" data-filter="${key}" data-active="${isActive ? 'true' : 'false'}" aria-pressed="${isActive ? 'true' : 'false'}">${label}</button>`;
    }).join('');

    setupProductFilterSwipeHint();
    updateProductFilterSwipeHint();

    return defaultFilter;
  }

  // Initial render of filter bar and product grid.
  // We must wait until the translation system has applied the initial
  // translations so that tr() calls inside renderProductFilters() can
  // resolve against a warm cache.  Two scenarios:
  //
  //   A) translationManager fires 'translationsApplied' BEFORE DOMContentLoaded
  //      — unlikely but handle it: fall through to the synchronous path below.
  //   B) The normal path: translationManager fires 'translationsApplied' AFTER
  //      DOMContentLoaded.  We listen for the event and render then.
  //
  // In both cases we guard with `filterBarRendered` so the render only runs once.
  let filterBarRendered = false;

  function initFilterBarAndProducts() {
    if (filterBarRendered) return;
    filterBarRendered = true;
    const utils = getAppUtils();
    if (utils) {
      utils.applyImageAssets();
    }
    currentFilter = renderProductFilters();
    scheduleRenderProducts();
  }

  // Listen for the translation-ready signal from translationManager.
  window.translationManager
    ? window.translationManager.on('translationsApplied', initFilterBarAndProducts)
    : window.addEventListener('translationsApplied', initFilterBarAndProducts);

  document.addEventListener('DOMContentLoaded', () => {
    // If translations were already applied synchronously before DOMContentLoaded
    // (or if translationManager is not present), fall back to immediate render.
    const tmDone = window.translationManager?.isInitialized;
    if (tmDone || !window.translationManager) {
      initFilterBarAndProducts();
      return;
    }

    // Safety net: if translationsApplied never fires within 3 s (e.g. network
    // error on first visit, incognito with blocked SW), render with whatever
    // data is available so users at least see product cards rather than a blank page.
    const translationTimeout = setTimeout(() => {
      if (!filterBarRendered) {
        console.warn('[i18n] translationsApplied not received within 3 s — rendering with fallback data');
        initFilterBarAndProducts();
      }
    }, 3000);

    // Clear the timeout once translations arrive normally.
    const clearTranslationTimeout = () => clearTimeout(translationTimeout);
    window.translationManager
      ? window.translationManager.on('translationsApplied', clearTranslationTimeout)
      : window.addEventListener('translationsApplied', clearTranslationTimeout);
    // Otherwise initFilterBarAndProducts() will be called by the event listener above.
  });

  window.addEventListener('languageChanged', () => {
    // Language switched: re-render filter bar with the new language's tr() values.
    // tr() already has the new language in cache at this point because setLanguage()
    // awaits preloadLanguage() before dispatching languageChanged.
    filterBarRendered = false; // allow re-render
    const defaultFilter = renderProductFilters();
    filterBarRendered = true;
    if (!currentFilter) {
      currentFilter = defaultFilter;
    }
    updateProductFilterButtonState(currentFilter || defaultFilter);
    scheduleRenderProducts();
  });

  // Product translations are loaded asynchronously after the initial UI render.
  // Re-render product cards once they're ready so Material / Application Scenario
  // and other i18n fields show the translated values rather than the zh-CN fallback.
  window.addEventListener('productTranslationsLoaded', () => {
    scheduleRenderProducts();
  });

  let currentPage = 1;
  let currentFilter = '';
  let productFilterSwipeHintBound = false;
  let productRenderRafId = 0;

  function scheduleRenderProducts() {
    if (productRenderRafId) return;
    productRenderRafId = window.requestAnimationFrame(() => {
      productRenderRafId = 0;
      renderProducts();
    });
  }

  function getItemsPerPage() {
    if (mqMobileSmall) return 3;
    if (mqDesktop)     return 8;
    if (mqTablet)      return 9;
    return 4;
  }

  function isMobileProductCarousel() {
    return mqMobileSmall;
  }

  function getMobileProductStepWidth() {
    const grid = document.getElementById('product-grid');
    if (!grid) return 280;

    const firstCard = grid.querySelector('.product-card');
    if (!firstCard) return Math.max(240, Math.floor(grid.clientWidth * 0.82));

    const cardStyles = window.getComputedStyle(firstCard);
    const cardWidth = firstCard.getBoundingClientRect().width;
    const cardMarginRight = parseFloat(cardStyles.marginRight || '0') || 0;
    return Math.max(220, Math.round(cardWidth + cardMarginRight + 14));
  }

  function updateMobileProductNavState() {
    if (!isMobileProductCarousel()) return;

    const grid = document.getElementById('product-grid');
    const prevBtn = document.getElementById('product-mobile-prev');
    const nextBtn = document.getElementById('product-mobile-next');

    if (!grid || !prevBtn || !nextBtn) return;

    const maxScrollLeft = Math.max(0, grid.scrollWidth - grid.clientWidth);
    const canScroll = maxScrollLeft > 8;
    const atStart = grid.scrollLeft <= 8;
    const atEnd = grid.scrollLeft >= maxScrollLeft - 8;

    prevBtn.disabled = !canScroll || atStart;
    nextBtn.disabled = !canScroll || atEnd;
    prevBtn.classList.toggle('is-disabled', prevBtn.disabled);
    nextBtn.classList.toggle('is-disabled', nextBtn.disabled);
  }

  function ensureProductGridShell(grid) {
    let shell = document.getElementById('product-grid-shell');
    if (shell) return shell;

    shell = document.createElement('div');
    shell.id = 'product-grid-shell';
    shell.className = 'product-grid-mobile-shell';
    grid.parentNode.insertBefore(shell, grid);
    shell.appendChild(grid);
    return shell;
  }

  let _mobileCtrlFadeTimer = null;
  let _mobileCtrlTouchHandler = null;
  let _mobileCtrlTouchEndHandler = null;
  let _mobileCtrlCenterRevealHandler = null;
  let _mobileCtrlCenterRevealRaf = 0;

  function resetMobileCtrlFadeTimer() {
    const controls = document.getElementById('product-grid-mobile-controls');
    if (!controls || controls.classList.contains('is-hidden')) return;
    controls.classList.remove('is-faded');
    if (_mobileCtrlFadeTimer) {
      clearTimeout(_mobileCtrlFadeTimer);
    }
    _mobileCtrlFadeTimer = setTimeout(() => {
      const c = document.getElementById('product-grid-mobile-controls');
      if (c) c.classList.add('is-faded');
    }, 1400);
  }

  function revealMobileControlsOnCenteredCard() {
    if (!isMobileProductCarousel()) return;

    const grid = document.getElementById('product-grid');
    const controls = document.getElementById('product-grid-mobile-controls');
    if (!grid || !controls || controls.classList.contains('is-hidden')) return;

    const cards = grid.querySelectorAll('.product-card');
    if (!cards || cards.length === 0) return;

    const gridRect = grid.getBoundingClientRect();
    const viewportCenterX = gridRect.left + (gridRect.width / 2);

    let nearestDist = Number.POSITIVE_INFINITY;
    let nearestCardWidth = 0;

    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const cardCenterX = rect.left + (rect.width / 2);
      const dist = Math.abs(cardCenterX - viewportCenterX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestCardWidth = rect.width;
      }
    });

    const centerThreshold = Math.max(24, nearestCardWidth * 0.16);
    if (nearestDist <= centerThreshold) {
      resetMobileCtrlFadeTimer();
    }
  }

  function renderMobileProductSideControls(showControls, disableControls = false) {
    const grid = document.getElementById('product-grid');
    if (!grid) return;

    const shell = ensureProductGridShell(grid);
    let controls = document.getElementById('product-grid-mobile-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.id = 'product-grid-mobile-controls';
      controls.className = 'product-grid-mobile-controls is-hidden';
      shell.appendChild(controls);
    }

    if (!showControls) {
      if (_mobileCtrlFadeTimer) { clearTimeout(_mobileCtrlFadeTimer); _mobileCtrlFadeTimer = null; }
      controls.classList.add('is-hidden');
      controls.classList.remove('is-faded');
      controls.innerHTML = '';
      return;
    }

    controls.classList.remove('is-hidden', 'is-faded');
    controls.innerHTML = `
      <button
        type="button"
        id="product-mobile-prev"
        class="product-side-nav-btn product-side-nav-btn-prev ios-nav-btn ${disableControls ? 'is-disabled' : ''}"
        ${disableControls ? 'disabled' : ''}
        aria-label="${tr('product_prev_page', 'Previous page')}">
        <span class="material-symbols-outlined" aria-hidden="true">keyboard_arrow_left</span>
      </button>
      <button
        type="button"
        id="product-mobile-next"
        class="product-side-nav-btn product-side-nav-btn-next ios-nav-btn ${disableControls ? 'is-disabled' : ''}"
        ${disableControls ? 'disabled' : ''}
        aria-label="${tr('product_next_page', 'Next page')}">
        <span class="material-symbols-outlined" aria-hidden="true">keyboard_arrow_right</span>
      </button>
    `;
    // Re-bind after innerHTML replacement (CSP: no inline handlers)
    const prevBtn = controls.querySelector('#product-mobile-prev');
    const nextBtn = controls.querySelector('#product-mobile-next');
    if (prevBtn) prevBtn.addEventListener('click', () => scrollMobileProducts(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => scrollMobileProducts(1));
    resetMobileCtrlFadeTimer();
  }

  function scrollMobileProducts(direction) {
    if (!isMobileProductCarousel()) {
      goToPage(currentPage + direction);
      return;
    }

    const grid = document.getElementById('product-grid');
    if (!grid) return;

    const stepWidth = getMobileProductStepWidth();
    grid.scrollBy({ left: direction * stepWidth, behavior: 'smooth' });
    window.setTimeout(updateMobileProductNavState, 220);
  }

  let lastItemsPerPage = getItemsPerPage();
  window.addEventListener('resize', debounce(() => {
    const nextItemsPerPage = getItemsPerPage();
    if (nextItemsPerPage !== lastItemsPerPage) {
      lastItemsPerPage = nextItemsPerPage;
      scheduleRenderProducts();
    }
  }, 150));

  function updateProductFilterSwipeHint() {
    const filterBar = document.getElementById('product-filter-bar');
    const hint = document.getElementById('product-filter-swipe-hint');
    if (!filterBar || !hint) return;

    const isMobile = mqMobile;
    const canScroll = filterBar.scrollWidth - filterBar.clientWidth > 8;
    const scrolledToEnd = filterBar.scrollLeft + filterBar.clientWidth >= filterBar.scrollWidth - 8;
    const shouldShow = isMobile && canScroll && !scrolledToEnd;

    hint.classList.toggle('is-hidden', !shouldShow);
  }

  function setupProductFilterSwipeHint() {
    if (productFilterSwipeHintBound) return;

    const filterBar = document.getElementById('product-filter-bar');
    if (!filterBar) return;

    filterBar.addEventListener('scroll', updateProductFilterSwipeHint, { passive: true });
    window.addEventListener('resize', debounce(updateProductFilterSwipeHint, 150));

    const hint = document.getElementById('product-filter-swipe-hint');
    if (hint) {
      hint.addEventListener('click', () => {
        filterBar.scrollBy({ left: 120, behavior: 'smooth' });
      });
    }

    productFilterSwipeHintBound = true;
  }

  function updateProductFilterButtonState(activeFilter) {
    document.querySelectorAll('#product-filter-bar .filter-btn').forEach(btn => {
      const isActive = btn.getAttribute('data-filter') === activeFilter;
      btn.setAttribute('data-active', isActive ? 'true' : 'false');
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');

      if (isActive) {
        btn.classList.remove('bg-white', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-300');
        btn.classList.add('bg-primary', 'text-white');
      } else {
        btn.classList.add('bg-white', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-300');
        btn.classList.remove('bg-primary', 'text-white');
      }
    });
  }

  function filterProducts(filter) {
    currentFilter = filter;
    currentPage = 1;
    updateProductFilterButtonState(filter);
    scheduleRenderProducts();
  }

  // 获取产品多语言文本的辅助函数（使用 product.i18nId 和字段名）
  function getProductI18nField(product, field, fallback = '') {
    const id = product && product.i18nId;
    if (id) {
      const key = `${id}_${field}`;
      const translated = tr(key);
      if (translated && translated !== key) return translated;
    }
    return fallback;
  }

  function renderProducts() {
    const grid = document.getElementById('product-grid');
    if (!grid) return;

    let meta = document.getElementById('product-grid-meta');
    if (!meta) {
      meta = document.createElement('div');
      meta.id = 'product-grid-meta';
      meta.className = 'mb-4 rounded-xl border border-primary/10 bg-white/80 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 product-grid-meta';
      grid.parentNode.insertBefore(meta, grid);
    }

    const allProducts = getProducts();
    const filtered = currentFilter ? allProducts.filter((p) => p.category === currentFilter) : allProducts;
    const orderedProducts = filtered;
    const mobileCarousel = isMobileProductCarousel();
    const itemsPerPage = mobileCarousel ? Math.max(1, orderedProducts.length) : getItemsPerPage();
    const totalPages = Math.max(1, Math.ceil(orderedProducts.length / itemsPerPage));

    if (currentPage > totalPages) {
      currentPage = totalPages;
    }

    const start = (currentPage - 1) * itemsPerPage;
    const pageProducts = orderedProducts.slice(start, start + itemsPerPage);

    const from = orderedProducts.length === 0 ? 0 : start + 1;
    const to = orderedProducts.length === 0 ? 0 : Math.min(start + pageProducts.length, orderedProducts.length);
    const currentPageCount = pageProducts.length;
    const prevDisabled = currentPage <= 1;
    const nextDisabled = currentPage >= totalPages;

    meta.innerHTML = `
      <div class="lg:flex lg:items-center lg:justify-between lg:gap-4">
      <div class="flex w-full items-center justify-between gap-3 overflow-x-auto whitespace-nowrap px-1 pb-1 sm:justify-center sm:px-0 sm:pb-0 lg:flex-1 lg:justify-start lg:pb-0">
        <span class="shrink-0">${tr('product_label_series', 'Series')}: <strong>${currentFilter ? tr(getCategoryI18nKey(currentFilter), currentFilter) : tr('all', 'All')}</strong></span>
        <span class="hidden shrink-0 sm:inline">${tr('product_label_page', 'Page')}: <strong>${currentPage}/${totalPages}</strong></span>
        <span class="hidden shrink-0 sm:inline">${tr('product_label_results', 'Results')}: <strong>${currentPageCount}</strong> / ${orderedProducts.length}</span>
      </div>
      <div class="mt-2 hidden w-full grid-cols-2 gap-2 product-meta-nav sm:mt-1 sm:flex sm:w-auto sm:grid-cols-none sm:gap-2 sm:justify-end lg:mt-0 lg:ml-4 lg:shrink-0">
        <button
          type="button"
          data-page="${currentPage - 1}"
          class="product-meta-nav-btn ios-nav-btn w-full justify-start ${prevDisabled ? 'is-disabled' : ''} sm:w-auto sm:justify-center"
          ${prevDisabled ? 'disabled' : ''}
          aria-label="${tr('product_prev_page', 'Previous page')}">
          <span class="product-meta-nav-icon material-symbols-outlined" aria-hidden="true">keyboard_arrow_left</span>
          <span class="product-meta-nav-label">${tr('product_prev_page', 'Previous')}</span>
        </button>
        <button
          type="button"
          data-page="${currentPage + 1}"
          class="product-meta-nav-btn ios-nav-btn w-full justify-end ${nextDisabled ? 'is-disabled' : ''} sm:w-auto sm:justify-center"
          ${nextDisabled ? 'disabled' : ''}
          aria-label="${tr('product_next_page', 'Next page')}">
          <span class="product-meta-nav-label">${tr('product_next_page', 'Next')}</span>
          <span class="product-meta-nav-icon material-symbols-outlined" aria-hidden="true">keyboard_arrow_right</span>
        </button>
      </div>
      </div>
    `;
    // Re-bind meta nav buttons after innerHTML replacement (CSP: no inline handlers)
    meta.querySelectorAll('.product-meta-nav-btn[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => goToPage(Number(btn.dataset.page)));
    });

    if (orderedProducts.length === 0) {
      grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8';
      renderMobileProductSideControls(false);
      grid.innerHTML = `
        <div class="col-span-full rounded-2xl border border-dashed border-primary/30 bg-white/70 dark:bg-slate-900/60 p-10 text-center">
          <span class="material-symbols-outlined text-4xl text-primary/70">inventory_2</span>
          <p class="mt-3 text-base font-bold text-primary dark:text-slate-100">${tr('product_empty_title', 'No matching products found')}</p>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">${tr('product_empty_desc', 'Try another series filter or contact us for custom recommendation.')}</p>
        </div>
      `;
      renderPagination(1);
      return;
    }

    grid.innerHTML = pageProducts.map((p) => {
      // 获取产品多语言文本（已由数据层自动处理，无需降级）
      const displayName = getProductI18nField(p, 'name', p.name) || `${tr(getCategoryI18nKey(p.category), p.category)} ${p.model || ''}`.trim();
      const badgeColorClass = p.badgeColor || 'bg-primary';
      const material = getProductI18nField(p, 'material', p.material);
      const minimumOrderQuantity = getProductI18nField(p, 'minimumOrderQuantity', p.minimumOrderQuantity);
      const throughput = getProductI18nField(p, 'throughput', p.throughput);
      const voltage = getProductI18nField(p, 'voltage', p.voltage);
      const frequency = getProductI18nField(p, 'frequency', p.frequency);
      const badge = getProductI18nField(p, 'badge', p.badge);
      const status = getProductI18nField(p, 'status', p.status);
      const imageRecognitionKey = p.imageRecognitionKey;
      const launchDate = getProductI18nField(p, 'launchTime', p.launchTime) || p.launchDate;
      const scene = getProductI18nField(p, 'scenarios', p.scenarios);
      return `
    <article class="product-card flex flex-col bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all border border-primary/10 group" data-category="${p.category}">
      <!-- 图片区域 (50-55%) -->
      <div class="relative h-[200px] sm:h-[210px] lg:h-[230px] w-full overflow-hidden bg-slate-50 dark:bg-slate-800/60 shrink-0">
        <img data-src="${p.productImage || resolveImage(imageRecognitionKey)}"
             src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E"
             alt="${displayName}" loading="lazy" decoding="async"
             class="w-full h-full object-contain p-4 group-hover:scale-[1.03] transition-transform duration-500 lazy-img">

        ${badge ? `<span class="absolute top-2 left-2 ${badgeColorClass} text-white px-2 py-0.5 rounded-full text-[10px] font-bold shadow">${badge}</span>` : ''}
        ${status ? `<span class="absolute top-2 right-2 bg-slate-900/80 text-white px-2 py-0.5 rounded-full text-[10px]">${status}</span>` : ''}
      </div>

      <!-- 内容区域 (40%) -->
      <div class="p-3 flex flex-col">
        <!-- 产品名称 + 型号 -->
        <div class="flex items-center justify-between gap-2 mb-1.5 shrink-0">
          <div class="flex-1 min-w-0">
            <h3 class="text-[13px] sm:text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight line-clamp-2">${displayName}</h3>
          </div>
          <div class="shrink-0 w-20 h-full min-h-[36px] flex flex-col items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1 py-1 text-center self-stretch">
            <p class="text-[10px] text-slate-500 dark:text-slate-400 truncate leading-none mb-0.5">${tr('product_label_model', 'Model')}</p>
            <p class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate leading-none">${p.model || '-'}</p>
          </div>
        </div>

        <!-- 参数网格 (2x2) -->
        <div class="grid grid-cols-2 gap-1 mb-1.5 shrink-0">
          <!-- 容量 -->
          <div class="flex items-center rounded-md bg-slate-50 dark:bg-slate-800/70 p-1 min-w-0">
            <p class="text-[10px] text-slate-500 dark:text-slate-400 truncate flex-shrink-0">${tr('product_label_capacity_throughput', 'Capacity') + ':'}</p>
            <p class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate flex-1 min-w-0 ml-1">${throughput || '-'}</p>
          </div>
          <!-- 电压/频率 -->
          <div class="flex items-center rounded-md bg-slate-50 dark:bg-slate-800/70 p-1 min-w-0">
            <p class="text-[10px] text-slate-500 dark:text-slate-400 truncate flex-shrink-0">
              ${tr('product_label_voltage_frequency', 'Voltage') + ':'}
            </p>
            <p class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate flex-1 min-w-0 ml-1">
              ${voltage || frequency ? `${voltage || '-'} / ${frequency || '-'}` : '-'}
            </p>
          </div>
          <!-- MOQ -->
          <div class="flex items-center rounded-md bg-slate-50 dark:bg-slate-800/70 p-1 min-w-0">
            <p class="text-[10px] text-slate-500 dark:text-slate-400 truncate flex-shrink-0">${tr('product_label_min_order_qty', 'MOQ') + ':'}</p>
            <p class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate flex-1 min-w-0 ml-1">${tr(minimumOrderQuantity || '-', minimumOrderQuantity || '-')}</p>
          </div>
          <!-- 上市时间 -->
          <div class="flex items-center rounded-md bg-slate-50 dark:bg-slate-800/70 p-1 min-w-0">
            <p class="text-[10px] text-slate-500 dark:text-slate-400 truncate flex-shrink-0">${tr('product_label_launch_date', 'LaunchDate') + ':'}</p>
            <p class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate flex-1 min-w-0 ml-1">${tr(launchDate || '2025', launchDate || '2025')}</p>
          </div>
        </div>
        <!-- 参数网格 (1x2) -->
          <!-- 材质 -->
        <div class="grid grid-cols-1 gap-1 mb-1.5 shrink-0">
          <div class="flex items-center rounded-md bg-slate-50 dark:bg-slate-800/70 p-1 min-w-0">
            <p class="text-[10px] text-slate-500 dark:text-slate-400 truncate flex-shrink-0">${tr('product_label_material', 'Material') + ':'}</p>
            <p class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate flex-1 min-w-0 ml-1">${material || '-'}</p>
          </div>
          <!-- 使用场景 -->
          <div class="flex items-center rounded-md bg-slate-50 dark:bg-slate-800/70 p-1 min-w-0">
            <p class="text-[10px] text-slate-500 dark:text-slate-400 truncate flex-shrink-0">${tr('product_label_scene', 'Scene') + ':'}</p>
            <p class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate flex-1 min-w-0 ml-1">${scene || '-'}</p>
          </div>
        </div>
        <!-- 按钮 (单行显示，固定高度) -->
        <div class="mt-auto grid grid-cols-2 gap-1 shrink-0">
          <button data-action="show-popup" class="inline-flex h-[36px] items-center justify-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 transition-colors">
            <span class="material-symbols-outlined text-[10px]">tune</span>
            <span class="truncate">${tr('product_optional_specs', 'Optional')}</span>
          </button>
          <button data-action="show-popup" class="inline-flex h-[36px] items-center justify-center gap-1 rounded-lg bg-primary px-2 py-1.5 text-xs font-bold text-white hover:bg-primary/90 transition-colors">
            <span class="material-symbols-outlined text-[10px]">request_page</span>
            <span class="truncate">${tr('product_request', 'Request')}</span>
          </button>
        </div>
      </div>
    </article>
  `;
    }).join('');

    if (mobileCarousel) {
      grid.className = 'product-grid-mobile mb-8';
      renderMobileProductSideControls(true, orderedProducts.length <= 1);
      grid.removeEventListener('scroll', updateMobileProductNavState);
      grid.removeEventListener('scroll', resetMobileCtrlFadeTimer);
      if (_mobileCtrlCenterRevealHandler) {
        grid.removeEventListener('scroll', _mobileCtrlCenterRevealHandler);
      }
      grid.addEventListener('scroll', updateMobileProductNavState, { passive: true });
      grid.addEventListener('scroll', resetMobileCtrlFadeTimer, { passive: true });
      _mobileCtrlCenterRevealHandler = () => {
        if (_mobileCtrlCenterRevealRaf) return;
        _mobileCtrlCenterRevealRaf = window.requestAnimationFrame(() => {
          _mobileCtrlCenterRevealRaf = 0;
          revealMobileControlsOnCenteredCard();
        });
      };
      grid.addEventListener('scroll', _mobileCtrlCenterRevealHandler, { passive: true });
      if (_mobileCtrlTouchHandler) {
        grid.removeEventListener('touchstart', _mobileCtrlTouchHandler);
      }
      if (_mobileCtrlTouchEndHandler) {
        grid.removeEventListener('touchend', _mobileCtrlTouchEndHandler);
      }
      _mobileCtrlTouchHandler = () => {
        resetMobileCtrlFadeTimer();
      };
      _mobileCtrlTouchEndHandler = () => {
        window.setTimeout(() => {
          updateMobileProductNavState();
          revealMobileControlsOnCenteredCard();
          resetMobileCtrlFadeTimer();
        }, 100);
      };
      grid.addEventListener('touchstart', _mobileCtrlTouchHandler, { passive: true });
      grid.addEventListener('touchend', _mobileCtrlTouchEndHandler, { passive: true });
      window.setTimeout(updateMobileProductNavState, 30);
    } else {
      grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8';
      renderMobileProductSideControls(false);
      grid.removeEventListener('scroll', updateMobileProductNavState);
      grid.removeEventListener('scroll', resetMobileCtrlFadeTimer);
      if (_mobileCtrlCenterRevealHandler) {
        grid.removeEventListener('scroll', _mobileCtrlCenterRevealHandler);
        _mobileCtrlCenterRevealHandler = null;
      }
      if (_mobileCtrlCenterRevealRaf) {
        window.cancelAnimationFrame(_mobileCtrlCenterRevealRaf);
        _mobileCtrlCenterRevealRaf = 0;
      }
      if (_mobileCtrlTouchHandler) {
        grid.removeEventListener('touchstart', _mobileCtrlTouchHandler);
        _mobileCtrlTouchHandler = null;
      }
      if (_mobileCtrlTouchEndHandler) {
        grid.removeEventListener('touchend', _mobileCtrlTouchEndHandler);
        _mobileCtrlTouchEndHandler = null;
      }
    }

    renderPagination(totalPages, {
      totalCount: orderedProducts.length,
      from,
      to,
      currentPageCount
    });

    // Re-bind product card & filter buttons after innerHTML replacement (CSP: no inline handlers)
    grid.querySelectorAll('[data-action="show-popup"]').forEach((btn) => {
      btn.addEventListener('click', () => showSmartPopupManual());
    });
    const filterBar = document.getElementById('product-filter-bar');
    if (filterBar) {
      filterBar.querySelectorAll('button[data-filter]').forEach((btn) => {
        btn.addEventListener('click', () => filterProducts(btn.dataset.filter));
      });
    }
  }

  function renderPagination(totalPages, pageStats = null) {
    const pagination = document.getElementById('pagination');
    if (isMobileProductCarousel()) {
      pagination.innerHTML = '';
      return;
    }

    if (totalPages <= 1) {
      pagination.innerHTML = '';
      return;
    }

    const allCount = pageStats && Number.isFinite(pageStats.totalCount)
      ? pageStats.totalCount
      : (currentFilter ? getProducts().filter((p) => p.category === currentFilter).length : getProducts().length);
    const itemsPerPage = getItemsPerPage();
    const fallbackFrom = (currentPage - 1) * itemsPerPage + 1;
    const fallbackTo = Math.min(currentPage * itemsPerPage, allCount);
    const from = pageStats && Number.isFinite(pageStats.from) ? pageStats.from : fallbackFrom;
    const to = pageStats && Number.isFinite(pageStats.to) ? pageStats.to : fallbackTo;
    const currentPageCount = pageStats && Number.isFinite(pageStats.currentPageCount)
      ? pageStats.currentPageCount
      : Math.max(0, to - from + 1);

    let html = '';
    html += `<div class="w-full mb-2 text-center text-xs text-slate-500 dark:text-slate-400">${tr('product_pagination_summary', 'Showing')} ${currentPageCount} ${tr('product_pagination_of', 'of')} ${allCount} · ${tr('product_label_page', 'Page')} ${currentPage}/${totalPages}</div>`;
    html += `<button data-page="${currentPage - 1}" class="pagination-btn inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}" ${currentPage === 1 ? 'disabled' : ''}>
    <span class="material-symbols-outlined text-lg">chevron_left</span>
    <span>${tr('product_prev_page', 'Previous')}</span>
  </button>`;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
        html += `<button data-page="${i}" class="pagination-btn px-4 py-2 rounded-lg text-sm font-medium ${i === currentPage ? 'bg-primary text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}">${i}</button>`;
      } else if (i === currentPage - 2 || i === currentPage + 2) {
        html += '<span class="px-2">...</span>';
      }
    }
    html += `<button data-page="${currentPage + 1}" class="pagination-btn inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}" ${currentPage === totalPages ? 'disabled' : ''}>
    <span>${tr('product_next_page', 'Next')}</span>
    <span class="material-symbols-outlined text-lg">chevron_right</span>
  </button>`;
    pagination.innerHTML = html;
    // Re-bind pagination buttons after innerHTML replacement (CSP: no inline handlers)
    pagination.querySelectorAll('.pagination-btn[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => goToPage(Number(btn.dataset.page)));
    });
  }

  function goToPage(page) {
    if (isMobileProductCarousel()) {
      return;
    }

    const allProducts = getProducts();
    const filtered = currentFilter ? allProducts.filter(p => p.category === currentFilter) : allProducts;
    const itemsPerPage = getItemsPerPage();
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (page >= 1 && page <= totalPages) {
      currentPage = page;
      scheduleRenderProducts();
      document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
    }
  }

  // ============================================
  // USER TRACKING
  // ============================================
  const userState = {
    firstVisit: Date.now(), visitCount: 0, scrollDepth: 0, timeOnPage: 0,
    productViews: [], formInteractions: 0, popupShown: false,
    popupCount: { header: 0, hero: 0, custom: 0, product: {} },
    lastPopupTime: 0, maxScrollReached: 0
  };

  function loadUserState() {
    const saved = localStorage.getItem('userState');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(userState, parsed);
      userState.visitCount++;
      userState.timeOnPage = 0;
      userState.scrollDepth = 0;
    } else {
      userState.visitCount = 1;
    }
    saveUserState();
  }

  function saveUserState() {
    localStorage.setItem('userState', JSON.stringify(userState));
  }

  function trackScrollDepth() {
    const scrollPercent = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
    userState.scrollDepth = Math.max(userState.scrollDepth, scrollPercent);
    userState.maxScrollReached = Math.max(userState.maxScrollReached, scrollPercent);
  }

  function trackTimeOnPage() {
    userState.timeOnPage++;
    saveUserState();
  }

  // ============================================
  // SIDEBAR SYSTEM
  // ============================================
  let secondaryExpanded = false;

  function setSecondaryContactsExpanded(expanded) {
    const secondary = document.getElementById('secondary-contacts');
    const btn = document.getElementById('expand-btn');
    if (!secondary || !btn) return;

    secondaryExpanded = !!expanded;
    const btnIcon = document.getElementById('expand-btn-icon') || document.getElementById('expand-btn-material-symbols-outlined-text');
    const tooltip = btn.querySelector('.contact-tooltip');

    if (secondaryExpanded) {
      secondary.classList.add('expanded');
      if (btnIcon) btnIcon.textContent = 'expand_less';
      if (tooltip) tooltip.setAttribute('data-i18n', 'sidebar_collapse');
      btn.classList.add('expanded');
    } else {
      secondary.classList.remove('expanded');
      if (btnIcon) btnIcon.textContent = 'expand_more';
      if (tooltip) tooltip.setAttribute('data-i18n', 'sidebar_expand');
      btn.classList.remove('expanded');
    }

    if (window.translationManager && typeof window.translationManager.applyTranslations === 'function') {
      window.translationManager.applyTranslations();
    }
  }

  function toggleSecondaryContacts() {
    setSecondaryContactsExpanded(!secondaryExpanded);
  }

  function setupSecondaryContactsAutoCollapse() {
    document.addEventListener('click', (event) => {
      if (!secondaryExpanded) return;
      const sidebar = document.getElementById('floating-sidebar');
      if (!sidebar) return;
      if (sidebar.contains(event.target)) return;
      setSecondaryContactsExpanded(false);
    });

    window.addEventListener('scroll', () => {
      if (!secondaryExpanded) return;
      setSecondaryContactsExpanded(false);
    }, { passive: true });
  }

  const indicatorState = {
    pageEnterAt: Date.now(),
    shownCount: 0,
    maxShowsPerSession: 2,
    lastShownAt: 0,
    cooldownMs: 20000,
    hasContactIntent: false,
    touchInteractions: 0,
    promptLoopTimer: null,
    hideTimer: null
  };

  function showIndicator() {
    const indicator = document.getElementById('sidebar-indicator');
    if (!indicator) return;

    const popupOverlay = document.getElementById('smart-popup-overlay');
    if (popupOverlay && popupOverlay.classList.contains('show')) return;

    if (indicatorState.hasContactIntent) return;
    if (indicatorState.shownCount >= indicatorState.maxShowsPerSession) return;
    if (indicatorState.lastShownAt && (Date.now() - indicatorState.lastShownAt) < indicatorState.cooldownMs) return;

    const elapsedSeconds = Math.floor((Date.now() - indicatorState.pageEnterAt) / 1000);
    const scrollPercent = Math.round((window.scrollY / Math.max(1, (document.body.scrollHeight - window.innerHeight))) * 100);
    const isMobile = mqMobile;

    // Friendly and intent-based: mobile appears earlier and with lighter signal requirements.
    const minWaitSeconds = isMobile ? 6 : 12;
    if (elapsedSeconds < minWaitSeconds) return;

    const isFirstShow = indicatorState.shownCount === 0;

    if (!isFirstShow) {
      if (isMobile) {
        const hasEnoughBrowseSignal = scrollPercent >= 3 || indicatorState.touchInteractions >= 1;
        const timeFallbackReached = elapsedSeconds >= 12;
        if (!hasEnoughBrowseSignal && !timeFallbackReached) return;
      } else if (scrollPercent < 18) {
        return;
      }
    }

    indicatorState.shownCount += 1;
    indicatorState.lastShownAt = Date.now();
    indicator.classList.add('show');

    // Ensure older hide timers do not instantly hide a newly shown indicator.
    if (indicatorState.hideTimer) {
      clearTimeout(indicatorState.hideTimer);
    }
    const visibleDuration = isMobile ? 10000 : 15000;
    indicatorState.hideTimer = setTimeout(() => {
      hideIndicator();
      indicatorState.hideTimer = null;
    }, visibleDuration);
  }

  function hideIndicator() {
    const indicator = document.getElementById('sidebar-indicator');
    if (!indicator) return;
    indicator.classList.remove('show');
  }

  function setupIndicatorPrompt() {
    indicatorState.pageEnterAt = Date.now();
    indicatorState.touchInteractions = 0;

    const markIntent = () => {
      indicatorState.hasContactIntent = true;
      hideIndicator();
      if (indicatorState.promptLoopTimer) {
        clearInterval(indicatorState.promptLoopTimer);
        indicatorState.promptLoopTimer = null;
      }
    };

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const indicator = document.getElementById('sidebar-indicator');
      if (indicator && indicator.classList.contains('show') && !target.closest('#sidebar-indicator')) {
        hideIndicator();
      }

      const touchedContactEntry = target.closest('#jump-btn-2, #jump-btn-3, #jump-btn-4, #secondary-contacts button, #contact-form, #smart-popup-form, [data-action="show-popup"]');
      if (touchedContactEntry) {
        markIntent();
      }
    });

    document.addEventListener('touchstart', () => {
      indicatorState.touchInteractions += 1;
    }, { passive: true });

    // First check after first-screen protection, then re-check periodically.
    const initialDelay = mqMobile ? 5000 : 10000;
    setTimeout(showIndicator, initialDelay);
    indicatorState.promptLoopTimer = setInterval(showIndicator, 10000);
  }

  function startWhatsApp() { window.open('https://wa.me/16478158194', '_blank'); }
  function startLine() { window.open('https://line.me/ti/p/+66840273150', '_blank'); }
  function startPhone() { window.location.href = 'tel:+16478158194'; }
  function startTelegram() { window.open('https://t.me/baeckerei-profi', '_blank'); }
  function startEmail() {
    window.location.href = 'mailto:support@yukoli.com';
  }
  function startFacebook() { window.open('https://www.facebook.com/people/Yukoli-Technology-Co-Ltd/61579549730250/', '_blank'); }
  function startInstagram() { window.open('https://instagram.com/baeckerei.profi', '_blank'); }
  function startTwitter() { window.open('https://twitter.com/baeckerei_profi', '_blank'); }
  function startLinkedIn() { window.open('https://linkedin.com/company/baeckereitechnik-profi', '_blank'); }
  function startTikTok() { showNotification('Coming Soon', 'success'); }

  // ============================================
  // NOTIFICATION SYSTEM
  // ============================================
  function showNotification(message, type = 'success') {
    const container = document.getElementById('notification-container') || createNotificationContainer();
    const notification = document.createElement('div');
    notification.className = `notification flex items-center gap-3 p-4 rounded-lg shadow-lg mb-3 transform translate-x-full transition-transform duration-300 ${type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`;
    notification.innerHTML = `<span class="material-symbols-outlined">${type === 'success' ? 'check_circle' : 'error'}</span><span class="text-sm font-medium">${message}</span>`;
    container.appendChild(notification);
    setTimeout(() => notification.classList.remove('translate-x-full'), 10);
    setTimeout(() => {
      notification.classList.add('translate-x-full');
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }

  function createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'fixed top-20 right-4 z-[9999] max-w-sm';
    document.body.appendChild(container);
    return container;
  }

  // ============================================
  // DARK MODE TOGGLE
  // ============================================
  function initDarkMode() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) document.documentElement.classList.add('dark');
  }

  // ============================================
  // MOBILE MENU
  // ============================================
  function isMobileMenuOpen(menu) {
    return menu.classList.contains('translate-x-0');
  }

  let lastMobileMenuToggleAt = 0;

  function setMobileMenuOpen(shouldOpen) {
    const overlay = document.getElementById('mobile-menu-overlay');
    const menu = document.getElementById('mobile-menu');

    if (!overlay || !menu) return;

    if (shouldOpen) {
      overlay.classList.remove('hidden');
      menu.classList.remove('translate-x-full');
      menu.classList.add('translate-x-0');
      document.body.style.overflow = 'hidden';
    } else {
      overlay.classList.add('hidden');
      menu.classList.add('translate-x-full');
      menu.classList.remove('translate-x-0');
      document.body.style.overflow = '';
    }
  }

  function toggleMobileMenu(forceOpen) {
    const menu = document.getElementById('mobile-menu');
    if (!menu) return;

    lastMobileMenuToggleAt = Date.now();
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !isMobileMenuOpen(menu);
    setMobileMenuOpen(shouldOpen);
  }

  function setupMobileMenuAutoClose() {
    document.addEventListener('click', (event) => {
      const menu = document.getElementById('mobile-menu');
      if (!menu || !isMobileMenuOpen(menu)) return;

      // Ignore the same click event that just toggled the menu open.
      if (Date.now() - lastMobileMenuToggleAt < 200) return;

      const clickedToggle = event.target.closest('[data-mobile-menu-toggle="true"]');
      if (menu.contains(event.target) || clickedToggle) return;

      setMobileMenuOpen(false);
    });

    // Ensure stale mobile state is reset when switching to desktop viewport.
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    });
  }

  function ensureMobileMenuClosed() {
    const menu = document.getElementById('mobile-menu');
    const overlay = document.getElementById('mobile-menu-overlay');

    if (menu) {
      menu.classList.add('translate-x-full');
      menu.classList.remove('translate-x-0', 'open');
    }

    if (overlay) {
      overlay.classList.add('hidden');
    }

    document.body.style.overflow = '';
  }

  // ============================================
  // 测试环境判断 (localhost / 127.0.0.1)
  // ============================================
  function isTestEnvironment() {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host.includes('.local') || host.includes('test');
  }

  function setupJumpingAnimation() {
    const jumpButtons = [
      document.getElementById('jump-btn-1'),
      document.getElementById('jump-btn-2'),
      document.getElementById('jump-btn-3'),
      document.getElementById('jump-btn-4')
    ];
    if (jumpButtons.some(btn => !btn)) return;
    let currentIndex = 0, animationTimer = null, isAnimating = false;
    const originalStyles = jumpButtons.map(btn => ({
      transform: btn.style.transform, boxShadow: btn.style.boxShadow,
      zIndex: btn.style.zIndex, animation: btn.style.animation
    }));

    function stopAllJumping() {
      jumpButtons.forEach((btn, index) => {
        if (btn) {
          btn.classList.remove('jump-active');
          btn.style.transform = originalStyles[index].transform || '';
          btn.style.boxShadow = originalStyles[index].boxShadow || '';
          btn.style.zIndex = originalStyles[index].zIndex || '';
          btn.style.animation = '';
        }
      });
      isAnimating = false;
    }

    function gentleStopButton(btn, index) {
      if (!btn) return;
      btn.style.transition = 'all 0.3s ease-out';
      setTimeout(() => {
        btn.classList.remove('jump-active');
        btn.style.transform = originalStyles[index].transform || '';
        btn.style.boxShadow = originalStyles[index].boxShadow || '';
        btn.style.zIndex = originalStyles[index].zIndex || '';
        setTimeout(() => { btn.style.transition = ''; }, 300);
      }, 100);
    }

    function startNextJump() {
      if (isAnimating) return;
      isAnimating = true;
      if (jumpButtons[currentIndex]) gentleStopButton(jumpButtons[currentIndex], currentIndex);

      let nextIndex = currentIndex, attempts = 0;
      while (attempts <= jumpButtons.length) {
        nextIndex = (nextIndex + 1) % jumpButtons.length;
        attempts++;
        const nextBtn = jumpButtons[nextIndex];
        if (nextBtn) {
          const rect = nextBtn.getBoundingClientRect();
          const isVisible = (rect.top >= -100 && rect.left >= -100 && rect.bottom <= window.innerHeight + 100 && rect.right <= window.innerWidth + 100);
          if (isVisible && !nextBtn.matches(':hover')) {
            currentIndex = nextIndex;
            break;
          }
        }
      }

      if (attempts > jumpButtons.length) { isAnimating = false; return; }

      const currentBtn = jumpButtons[currentIndex];
      if (!currentBtn) { isAnimating = false; return; }

      originalStyles[currentIndex] = {
        transform: currentBtn.style.transform, boxShadow: currentBtn.style.boxShadow,
        zIndex: currentBtn.style.zIndex, animation: currentBtn.style.animation
      };
      currentBtn.classList.add('jump-active');
      const rect = currentBtn.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        currentBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      setTimeout(() => {
        if (currentBtn && currentBtn.classList.contains('jump-active')) gentleStopButton(currentBtn, currentIndex);
        isAnimating = false;
      }, 800);
    }

    function startAnimationCycle() {
      stopAllJumping();
      if (animationTimer) clearInterval(animationTimer);
      setTimeout(startNextJump, 1000);
      animationTimer = setInterval(startNextJump, 1200);
    }

    function stopAnimationCycle() {
      if (animationTimer) { clearInterval(animationTimer); animationTimer = null; }
      stopAllJumping();
    }

    function setupButtonInteractions() {
      jumpButtons.forEach((btn) => {
        if (btn) {
          btn.addEventListener('mouseenter', () => {
            btn.classList.remove('jump-active');
            btn.style.transform = 'scale(1.05)';
            btn.style.transition = 'transform 0.2s ease-out';
          });
          btn.addEventListener('mouseleave', () => {
            btn.style.transform = '';
            btn.style.transition = '';
          });
          btn.addEventListener('click', () => {
            btn.style.transform = 'scale(0.95)';
            setTimeout(() => { btn.style.transform = ''; }, 150);
            btn.dataset.lastClicked = Date.now();
            stopAnimationCycle();
            setTimeout(startAnimationCycle, 2000);
          });
        }
      });
    }

    function setupVisibilityHandler() {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopAnimationCycle();
        else setTimeout(startAnimationCycle, 500);
      });
    }

    function init() {
      if (document.readyState !== 'complete') {
        window.addEventListener('load', () => setTimeout(init, 500));
        return;
      }
      setupButtonInteractions();
      setupVisibilityHandler();
      setTimeout(startAnimationCycle, 3000);
      let lastActivity = Date.now();
      setInterval(() => {
        if (Date.now() - lastActivity > 30000 && animationTimer) {
          clearInterval(animationTimer);
          animationTimer = setInterval(startNextJump, 5000);
        }
      }, 10000);
      ['mousemove', 'click', 'keydown', 'scroll'].forEach(event => {
        window.addEventListener(event, () => { lastActivity = Date.now(); }, { passive: true });
      });
    }
    init();
    return { start: startAnimationCycle, stop: stopAnimationCycle, next: startNextJump };
  }

  // ============================================
  // 智能弹窗系统 (优化版)
  // ============================================
  const smartPopup = {
    state: {
      popupShownThisSession: 0,
      maxPopupsPerSession: 2,
      lastPopupTime: null,
      popupCooldown: 30000,
      pageStartAt: Date.now(),
      autoPopupDisabledForSession: false,
      initialDelayReached: false,
      engagementScore: 0,
      scoreThresholdDesktop: 50,
      scoreThresholdMobile: 60,
      minScrollPercentBeforeAuto: 20,
      delayDesktopSeconds: 20,
      delayMobileSeconds: 25,
      forceShowAfterDesktopSeconds: 35,
      forceShowAfterMobileSeconds: 40,
      isActivelyScrolling: false,
      scrollIdleTimer: null,
      storageKeys: {
        convertedUntil: 'smartPopupConvertedUntil'
      },
      suppression: {
        convertedUntil: 0
      },
      flags: {
        nonLinkClickScored: false,
        productInteractionScored: false,
        scrollDepthScored: false,
        productDwellScored: false,
        nonHeroDwellScored: false,
        friendlyHandlersBound: false
      }
    },

    init() {
      this.state.pageStartAt = Date.now();
      this.loadSuppressionState();
      this.setupTracking();
      this.setupFriendlyCloseHandlers();
      this.checkConditionsLoop();
      this.updateSessionCount();
    },

    loadSuppressionState() {
      const { convertedUntil } = this.state.storageKeys;
      this.state.suppression.convertedUntil = Number(localStorage.getItem(convertedUntil) || 0);
    },

    addScore(points, flagKey) {
      if (flagKey && this.state.flags[flagKey]) return;
      if (flagKey) this.state.flags[flagKey] = true;
      this.state.engagementScore += points;
    },

    getScrollPercent() {
      const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollableHeight <= 0) return 0;
      return Math.round((window.scrollY / scrollableHeight) * 100);
    },

    hasInputFocus() {
      const activeElement = document.activeElement;
      if (!activeElement) return false;
      return ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName) || activeElement.isContentEditable;
    },

    isSuppressedByStorage() {
      if (isTestEnvironment()) return false;
      const now = Date.now();
      return now < this.state.suppression.convertedUntil;
    },

    isAutoPopupAllowed() {
      if (document.hidden) return false;
      if (this.state.autoPopupDisabledForSession) return false;
      if (this.state.popupShownThisSession >= this.state.maxPopupsPerSession) return false;
      if (this.isSuppressedByStorage()) return false;
      if (this.state.lastPopupTime && (Date.now() - this.state.lastPopupTime) < this.state.popupCooldown) return false;
      if (!this.state.initialDelayReached) return false;
      if (this.hasInputFocus()) return false;
      if (this.getScrollPercent() < this.state.minScrollPercentBeforeAuto) return false;
      return true;
    },

    setupTracking() {
      document.addEventListener('click', (e) => {
        const isLinkLike = e.target.closest('a, button, [role="button"]');
        const isInput = e.target.closest('input, textarea, select');
        const productIntentTarget = e.target.closest('#products .product-card, #product-filter-bar .filter-btn, #pagination .pagination-btn, #product-grid-mobile-controls button');

        if (productIntentTarget) {
          this.addScore(35, 'productInteractionScored');
        }

        if (!isLinkLike && !isInput) {
          this.addScore(10, 'nonLinkClickScored');
        }
      });

      this.setupScrollTracking();
      this.setupProductSectionObserver();
    },

    setupScrollTracking() {
      let nonHeroTimer = 0;
      let nonHeroInterval = null;

      window.addEventListener('scroll', () => {
        this.state.isActivelyScrolling = true;
        if (this.state.scrollIdleTimer) clearTimeout(this.state.scrollIdleTimer);
        this.state.scrollIdleTimer = setTimeout(() => {
          this.state.isActivelyScrolling = false;
        }, 450);

        const scrollPercent = this.getScrollPercent();
        if (scrollPercent >= 50) {
          this.addScore(30, 'scrollDepthScored');
        }

        const heroSection = document.querySelector('section:first-of-type');
        if (!heroSection) return;

        const heroRect = heroSection.getBoundingClientRect();
        const isPastHero = window.scrollY > heroRect.height;

        if (isPastHero) {
          if (!nonHeroInterval && !this.state.flags.nonHeroDwellScored) {
            nonHeroTimer = 0;
            nonHeroInterval = setInterval(() => {
              nonHeroTimer++;
              if (nonHeroTimer >= 20) {
                this.addScore(20, 'nonHeroDwellScored');
                clearInterval(nonHeroInterval);
                nonHeroInterval = null;
              }
            }, 1000);
          }
        } else if (nonHeroInterval) {
          clearInterval(nonHeroInterval);
          nonHeroInterval = null;
        }
      }, { passive: true });
    },

    setupProductSectionObserver() {
      const productSection = document.getElementById('products');
      if (!productSection) return;

      let productTimer = 0;
      let productInterval = null;

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            if (this.state.flags.productDwellScored) return;
            productTimer = 0;
            if (productInterval) clearInterval(productInterval);
            productInterval = setInterval(() => {
              productTimer++;
              if (productTimer >= 20) {
                this.addScore(40, 'productDwellScored');
                clearInterval(productInterval);
                productInterval = null;
              }
            }, 1000);
          } else if (productInterval) {
            clearInterval(productInterval);
            productInterval = null;
          }
        });
      }, { threshold: 0.35 });

      observer.observe(productSection);
    },

    checkConditionsLoop() {
      const delaySeconds = mqMobile
        ? this.state.delayMobileSeconds
        : this.state.delayDesktopSeconds;

      setTimeout(() => {
        this.state.initialDelayReached = true;
        // Evaluate immediately once the first-screen protection window ends.
        this.evaluateConditions();
      }, delaySeconds * 1000);

      setInterval(() => this.evaluateConditions(), 1000);
    },

    evaluateConditions() {
      if (!this.isAutoPopupAllowed()) return;

      const isMobile = mqMobile;
      const forceAfterSeconds = isMobile ? this.state.forceShowAfterMobileSeconds : this.state.forceShowAfterDesktopSeconds;
      const elapsedSeconds = Math.floor((Date.now() - this.state.pageStartAt) / 1000);

      if (elapsedSeconds >= forceAfterSeconds) {
        this.showPopup('timed-fallback', { manual: false });
        return;
      }

      const threshold = isMobile ? this.state.scoreThresholdMobile : this.state.scoreThresholdDesktop;

      if (this.state.engagementScore >= threshold) {
        this.showPopup('engagement-score', { manual: false });
      }
    },

    updateSessionCount() {
      const countElement = document.getElementById('today-popup-count');
      if (!countElement) return;
      countElement.textContent = `${this.state.popupShownThisSession}/${this.state.maxPopupsPerSession}`;
    },

    updateTriggerReason(triggerReason) {
      const reasonElement = document.getElementById('trigger-reason');
      if (!reasonElement) return;

      let message = tr('popup_trigger_default', 'We noticed your interest in our products');
      if (triggerReason === 'manual-click') {
        message = tr('popup_trigger_manual_click', 'You clicked the consultation button');
      }

      reasonElement.innerHTML = `<span class="material-symbols-outlined">info</span><span>${message}</span>`;
    },

    showPopup(triggerReason, options = {}) {
      const { manual = false } = options;
      const overlay = document.getElementById('smart-popup-overlay');
      if (!overlay || overlay.classList.contains('show')) return;

      if (!manual) {
        if (!this.isAutoPopupAllowed()) return;
        this.state.popupShownThisSession++;
        this.state.lastPopupTime = Date.now();
        this.updateSessionCount();
      } else {
        this.state.lastPopupTime = Date.now();
      }

      this.updateTriggerReason(triggerReason);
      applyPopupVisibility();

      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.paddingRight = scrollbarWidth + 'px';
      document.body.style.overflow = 'hidden';
      overlay.classList.add('show');
    },

    saveConversionSuppression() {
      const until = Date.now() + 48 * 60 * 60 * 1000;
      this.state.suppression.convertedUntil = until;
      localStorage.setItem(this.state.storageKeys.convertedUntil, String(until));
    },

    closePopup(options = {}) {
      const { dismissed = false, converted = false } = options;
      const overlay = document.getElementById('smart-popup-overlay');
      if (!overlay) return;

      // Use close time as cooldown anchor to avoid immediate re-open.
      this.state.lastPopupTime = Date.now();

      if (dismissed) {
        this.state.autoPopupDisabledForSession = true;
      }

      if (converted) {
        this.state.autoPopupDisabledForSession = true;
        this.saveConversionSuppression();
      }

      overlay.classList.add('closing');
      setTimeout(() => {
        overlay.classList.remove('show', 'closing');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
      }, 200);
    },

    setupFriendlyCloseHandlers() {
      if (this.state.flags.friendlyHandlersBound) return;
      this.state.flags.friendlyHandlersBound = true;

      const overlay = document.getElementById('smart-popup-overlay');
      if (overlay) {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) {
            // Overlay click is treated as soft close, not a valid dismissal.
            this.closePopup();
          }
        });
      }

      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const popupOverlay = document.getElementById('smart-popup-overlay');
        if (popupOverlay && popupOverlay.classList.contains('show')) {
          // Esc is treated as soft close, not a valid dismissal.
          this.closePopup();
        }
      });
    }
  };

  // 控制弹窗中测试环境才显示的元素
  function applyPopupVisibility() {
    const isTest = isTestEnvironment();
    const countEl = document.getElementById('popup-today-count');
    const reasonEl = document.getElementById('trigger-reason');
    if (countEl) countEl.style.display = isTest ? 'flex' : 'none';
    if (reasonEl) reasonEl.style.display = isTest ? 'flex' : 'none';
  }

  function showSmartPopupManual() {
    smartPopup.showPopup('manual-click', { manual: true });
  }

  function closeSmartPopup() {
    smartPopup.closePopup({ dismissed: true });
  }

  // ============================================
  // 邮件发送功能 - 发送到指定邮箱 (增强数据收集)
  // ============================================
  async function submitSmartPopupForm(event) {
    event.preventDefault();
    const form = document.getElementById('smart-popup-form');
    if (!form) { showNotification(tr('notify_form_not_found', 'Form not found'), 'error'); return; }
    const formData = {
      formType: 'smart_popup',
      name: form.querySelector('input[name="name"]')?.value,
      email: form.querySelector('input[name="email"]')?.value,
      phone: form.querySelector('input[name="phone"]')?.value,
      country: form.querySelector('input[name="country"]')?.value,
      message: form.querySelector('textarea[name="message"]')?.value,
      language: getCurrentLanguage(),
      browserLanguage: navigator.language,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      pageUrl: window.location.href,
      timeOnPage: userState?.timeOnPage || 0,
      scrollDepth: userState?.scrollDepth || 0,
      userAgent: navigator.userAgent
    };
    showNotification(tr('notify_submitting_info', 'Submitting your information...'), 'success');
    try {
      await fetch('https://script.google.com/macros/s/AKfycbyikM1ArEFhJhQUSAp6l4DHJcGzDDK1cckL-KOrVbjipoMGSKsOOlhFWJGTPB6qOys/exec', {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      showNotification(tr('notify_submit_success', 'Submitted successfully!'), 'success');
      form.reset();
      setTimeout(() => smartPopup.closePopup({ converted: true }), 500);
    } catch (error) {
      console.error('提交失败:', error);
      showNotification(tr('notify_submit_received', 'Submitted successfully! We have received your information.'), 'success');
      form.reset();
      setTimeout(() => smartPopup.closePopup({ converted: true }), 500);
    }
  }

  async function submitContactForm(event) {
    event.preventDefault();
    const form = document.getElementById('contact-form');
    if (!form) { showNotification(tr('notify_form_not_found', 'Form not found'), 'error'); return; }
    const formData = {
      formType: 'contact_page',
      name: form.querySelector('input[name="name"]')?.value || '',
      company: form.querySelector('input[name="company"]')?.value || '',
      email: form.querySelector('input[name="email"]')?.value || '',
      phone: form.querySelector('input[name="phone"]')?.value || '',
      country: form.querySelector('input[name="country"]')?.value || '',
      message: form.querySelector('textarea[name="message"]')?.value || '',
      language: getCurrentLanguage(),
      browserLanguage: navigator.language,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      pageUrl: window.location.href,
      timeOnPage: userState?.timeOnPage || 0,
      scrollDepth: userState?.scrollDepth || 0,
      userAgent: navigator.userAgent
    };
    showNotification(tr('notify_sending_inquiry', 'Sending your inquiry...'), 'success');
    try {
      await fetch('https://script.google.com/macros/s/AKfycbyikM1ArEFhJhQUSAp6l4DHJcGzDDK1cckL-KOrVbjipoMGSKsOOlhFWJGTPB6qOys/exec', {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      showNotification(tr('notify_submit_success', 'Submitted successfully!'), 'success');
    } catch (error) {
      console.warn('Fetch 失败，降级到 mailto 备用方案', error);
      submitViaMailto(formData, 'contact_page');
    }
  }

  function submitViaMailto(formData, formType) {
    const subject = encodeURIComponent(`${formType === 'smart_popup' ? tr('mailto_subject_smart_popup', 'Smart Popup') : tr('mailto_subject_contact_form', 'Contact Form')} ${tr('mailto_subject_inquiry', 'Inquiry')} - ${formData.name}`);
    const body = encodeURIComponent(`
${tr('mailto_label_name', 'Name')}: ${formData.name}
${tr('mailto_label_email', 'Email')}: ${formData.email}
${tr('mailto_label_phone', 'Phone')}: ${formData.phone}
${tr('mailto_label_company', 'Company')}: ${formData.company || tr('mailto_not_provided', 'Not provided')}
${tr('mailto_label_country', 'Country')}: ${formData.country || tr('mailto_not_provided', 'Not provided')}
${tr('mailto_label_message', 'Message')}: ${formData.message}

------------ ${tr('mailto_section_user_info', 'User Information')} ------------
${tr('mailto_label_ip', 'IP Address')}: ${tr('mailto_ip_fetching', 'Fetching...')}
${tr('mailto_label_user_language', 'User Language')}: ${getCurrentLanguage()}
${tr('mailto_label_browser_language', 'Browser Language')}: ${navigator.language}
${tr('mailto_label_screen_resolution', 'Screen Resolution')}: ${window.screen.width}x${window.screen.height}
${tr('mailto_label_timezone', 'Timezone')}: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
${tr('mailto_label_page_url', 'Page URL')}: ${window.location.href}
${tr('mailto_label_submit_time', 'Submit Time')}: ${new Date().toLocaleString()}
${tr('mailto_label_time_on_page', 'Time on Page')}: ${userState.timeOnPage || 0}${tr('mailto_unit_seconds', 's')}
${tr('mailto_label_scroll_depth', 'Scroll Depth')}: ${userState.scrollDepth || 0}%
${tr('mailto_label_product_interest_clicks', 'Product Interest Clicks')}: 0
------------ ${tr('mailto_section_browser_info', 'Browser Information')} ------------
${tr('mailto_label_user_agent', 'User Agent')}: ${navigator.userAgent}
  `);
    window.location.href = `mailto:179564128@qq.com?subject=${subject}&body=${body}`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => smartPopup.init(), 1000);
    setupIndicatorPrompt();
    setupMobileMenuAutoClose();
    setupSecondaryContactsAutoCollapse();
    // Ensure mobile menu is closed on page load
    ensureMobileMenuClosed();
  });

  let jumpAnimationSystem = null;
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => jumpAnimationSystem = setupJumpingAnimation(), 1000);
  });

  window.addEventListener('beforeunload', () => {
    if (jumpAnimationSystem && jumpAnimationSystem.stop) jumpAnimationSystem.stop();
  });

  // ─── bindAllEvents ───────────────────────────────────────────────────────────
  // Replaces all inline onclick/onsubmit/onkeyup attributes removed from HTML
  // to comply with CSP script-src-attr 'none'.
  function bindAllEvents() {
    // Language dropdown toggle
    const langBtn = document.getElementById('lang-dropdown-btn');
    if (langBtn) langBtn.addEventListener('click', (e) => toggleLanguageDropdown(e));

    // Language option buttons (all buttons with data-code inside #language-dropdown)
    document.querySelectorAll('#language-dropdown button[data-code]').forEach((btn) => {
      btn.addEventListener('click', () => setLanguage(btn.dataset.code));
    });

    // Language search input
    const langSearch = document.querySelector('#language-dropdown input[type="text"]');
    if (langSearch) langSearch.addEventListener('keyup', () => filterLanguages(langSearch.value));

    // Smart popup open buttons — static HTML buttons carry data-action="show-popup"
    document.querySelectorAll('[data-action="show-popup"]').forEach((btn) => {
      btn.addEventListener('click', () => showSmartPopupManual());
    });

    // Mobile menu open
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => toggleMobileMenu(true));

    // Mobile menu overlay + close button + nav links → close
    const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');
    if (mobileMenuOverlay) mobileMenuOverlay.addEventListener('click', () => toggleMobileMenu(false));

    const mobileMenuClose = document.getElementById('mobile-menu-close');
    if (mobileMenuClose) mobileMenuClose.addEventListener('click', () => toggleMobileMenu(false));

    ['mobile-menu-nav-nav-vorteile-link',
      'mobile-menu-nav-nav-produkte-link',
      'mobile-menu-nav-nav-vertrauen-link',
      'mobile-menu-nav-nav-contact-link'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => toggleMobileMenu(false));
    });

    // Smart popup close
    const popupCloseBtn = document.getElementById('smart-popup-header-block-closesmartpopup-button');
    if (popupCloseBtn) popupCloseBtn.addEventListener('click', () => closeSmartPopup());

    // Smart popup form submit
    const smartPopupForm = document.getElementById('smart-popup-form');
    if (smartPopupForm) {
      smartPopupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        submitSmartPopupForm(e);
      });
    }

    // Contact form submit
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
      contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        submitContactForm(e);
      });
    }

    // Header consultation button → open smart popup
    const jumpBtn1 = document.getElementById('jump-btn-1');
    if (jumpBtn1) jumpBtn1.addEventListener('click', () => showSmartPopupManual());

    // Hero section primary CTA → open smart popup
    const heroBtnPrimary = document.getElementById('hero-btn-primary');
    if (heroBtnPrimary) heroBtnPrimary.addEventListener('click', () => showSmartPopupManual());

    // Factory video play button → play video
    const videoPlayBtn = document.getElementById('factory-video-play-btn');
    const factoryVideo = document.getElementById('factory-video');
    if (videoPlayBtn && factoryVideo) {
      videoPlayBtn.addEventListener('click', () => {
        factoryVideo.play();
        factoryVideo.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    // Floating sidebar contact buttons
    const jumpBtn2 = document.getElementById('jump-btn-2');
    if (jumpBtn2) jumpBtn2.addEventListener('click', () => startWhatsApp());

    const jumpBtn3 = document.getElementById('jump-btn-3');
    if (jumpBtn3) jumpBtn3.addEventListener('click', () => startLine());

    const jumpBtn4 = document.getElementById('jump-btn-4');
    if (jumpBtn4) jumpBtn4.addEventListener('click', () => startPhone());

    // Contact section quick buttons
    const quickWhatsApp = document.getElementById('contact-quick-whatsapp');
    if (quickWhatsApp) quickWhatsApp.addEventListener('click', () => startWhatsApp());

    const quickLine = document.getElementById('contact-quick-line');
    if (quickLine) quickLine.addEventListener('click', () => startLine());

    const quickEmail = document.getElementById('contact-quick-email');
    if (quickEmail) quickEmail.addEventListener('click', () => startEmail());

    // Secondary sidebar contacts
    const emailBtn = document.getElementById('secondary-contacts-startemail-button');
    if (emailBtn) emailBtn.addEventListener('click', () => startEmail());

    const fbBtn = document.getElementById('secondary-contacts-startfacebook-button');
    if (fbBtn) fbBtn.addEventListener('click', () => startFacebook());

    const tiktokBtn = document.getElementById('secondary-contacts-starttiktok-button');
    if (tiktokBtn) tiktokBtn.addEventListener('click', () => startTikTok());

    // Expand secondary contacts
    const expandBtn = document.getElementById('expand-btn');
    if (expandBtn) expandBtn.addEventListener('click', () => toggleSecondaryContacts());

    // Hide sidebar indicator
    const hideIndicatorBtn = document.getElementById('sidebar-indicator-card-div-1-hideindicator-button');
    if (hideIndicatorBtn) hideIndicatorBtn.addEventListener('click', () => hideIndicator());
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAllEvents);
  } else {
    bindAllEvents();
  }

  global.bindAllEvents = bindAllEvents;
  global.smartPopup = smartPopup;
  global.userState = userState;
  Object.assign(global, {
    tr,
    setupBackToTopButton,
    getAppUtils,
    resolveImage,
    getProducts,
    renderProductFilters,
    filterProducts,
    renderProducts,
    renderPagination,
    goToPage,
    scrollMobileProducts,
    loadUserState,
    saveUserState,
    trackScrollDepth,
    trackTimeOnPage,
    toggleSecondaryContacts,
    showIndicator,
    hideIndicator,
    startWhatsApp,
    startLine,
    startPhone,
    startTelegram,
    startEmail,
    startFacebook,
    startInstagram,
    startTwitter,
    startLinkedIn,
    startTikTok,
    showNotification,
    createNotificationContainer,
    initDarkMode,
    toggleMobileMenu,
    isTestEnvironment,
    setupJumpingAnimation,
    applyPopupVisibility,
    showSmartPopupManual,
    closeSmartPopup,
    submitSmartPopupForm,
    submitContactForm,
    submitViaMailto
  });
})(window);
// END: Extracted page logic from index.html
