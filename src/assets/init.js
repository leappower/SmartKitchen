// init.js - Initialization and user tracking code
// This code runs immediately and doesn't wait for DOM ready

// Service Worker Registration
let serviceWorkerRegistration = null;

// Guard flag: only reload after the user explicitly clicked "Update Now".
// Without this, `controllerchange` would also fire on first-visit / incognito
// (when there is no previous controller) and trigger an unexpected page reload.
let pendingSwReload = false;

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js')
    .then((registration) => {
      serviceWorkerRegistration = registration;

      // Handle Service Worker updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showServiceWorkerUpdateNotification();
          }
        });
      });

      // Handle controller change (new SW activated).
      // Only reload when the user intentionally triggered the update.
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (pendingSwReload) {
          window.location.reload();
        }
      });

      // Check for existing waiting SW
      if (registration.waiting) {
        showServiceWorkerUpdateNotification();
      }
    })
    .catch((error) => {
      console.error('[SW] Registration failed:', error);
    });
}

function showServiceWorkerUpdateNotification() {
  // Avoid duplicate notifications
  if (document.getElementById('sw-update-notification')) return;

  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'sw-update-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    gap: 16px;
    z-index: 10001;
    animation: slide-down 0.3s ease-out;
  `;

  notification.innerHTML = `
    <span style="color: #333; font-size: 14px;">A new version is available. Click to update.</span>
    <button id="sw-update-button" style="
      background: #3498db;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    ">Update Now</button>
    <button id="sw-dismiss-button" style="
      background: transparent;
      color: #666;
      border: none;
      padding: 4px 8px;
      cursor: pointer;
      font-size: 18px;
    ">×</button>
  `;

  document.body.appendChild(notification);

  document.getElementById('sw-update-button').addEventListener('click', () => {
    if (serviceWorkerRegistration && serviceWorkerRegistration.waiting) {
      // Set flag BEFORE postMessage so the controllerchange handler sees it.
      pendingSwReload = true;
      serviceWorkerRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    notification.remove();
  });

  document.getElementById('sw-dismiss-button').addEventListener('click', () => {
    notification.remove();
  });
}

// Register Service Worker immediately
registerServiceWorker();

// User Activity Tracking for Smart Popup System
let userActivity = {
  timeOnPage: 0,
  timeOnProductSection: 0,
  inProductSection: false,
  lastActivityTime: Date.now(),
  nonLinkClickCount: 0,
  hasScrolled: false,
  scrollDepth: 0,
  popupShownCount: 0,
  maxPopupsPerSession: 4,
  popupTriggers: {
    timeOnPage: false,
    inProductSection: false,
    nonLinkClick: false,
    manual: false
  }
};

// Start tracking time
setInterval(() => {
  userActivity.timeOnPage++;

  if (userActivity.inProductSection) {
    userActivity.timeOnProductSection++;
  }
}, 1000);

// Track user activity
document.addEventListener('mousemove', () => {
  userActivity.lastActivityTime = Date.now();
});

document.addEventListener('scroll', () => {
  userActivity.lastActivityTime = Date.now();
  userActivity.hasScrolled = true;

  const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
  const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  userActivity.scrollDepth = (winScroll / height) * 100;
});

// Track clicks on non-link elements (potential interested users)
document.addEventListener('click', (e) => {
  userActivity.lastActivityTime = Date.now();

  const isLink = e.target.closest('a, button, [role="button"]');
  const isInput = e.target.closest('input, textarea, select');
  const isInteractive = e.target.closest('.product-card, .certificate-card, nav, header, .floating-sidebar');

  if (!isLink && !isInput && !isInteractive && userActivity.inProductSection) {
    userActivity.nonLinkClickCount++;
  }
});

// Track product section visibility
function setupProductSectionTracking() {
  const productSection = document.getElementById('produkten');
  if (!productSection) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      userActivity.inProductSection = entry.isIntersecting;
    });
  }, { threshold: 0.3 });

  observer.observe(productSection);
}

// Make userActivity available globally for debugging
window.userActivity = userActivity;

// Video focus control system
function setupVideoFocusControl() {
  const factoryVideo = document.getElementById('factory-video');
  if (!factoryVideo) return;

  // Set initial state: muted for autoplay
  factoryVideo.muted = true;
  
  // Track visibility state
  let isVideoVisible = false;
  let wasPlaying = false;
  
  // Intersection Observer to detect video visibility
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      isVideoVisible = entry.isIntersecting;
      
      if (isVideoVisible) {
        // Video is in viewport - try to play
        if (!factoryVideo.paused) return;
        
        const playPromise = factoryVideo.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.log('Video autoplay failed:', error);
            // If autoplay fails, show play button
            const playBtn = document.getElementById('factory-video-play-btn');
            if (playBtn) playBtn.style.display = 'block';
          });
        }
      } else {
        // Video is out of viewport - pause if playing
        if (!factoryVideo.paused) {
          wasPlaying = true;
          factoryVideo.pause();
        } else {
          wasPlaying = false;
        }
      }
    });
  }, {
    threshold: 0.3, // 30% of video visible
    rootMargin: '50px' // Add margin for smoother transitions
  });

  observer.observe(factoryVideo);

  // Handle page visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Page is hidden - pause video
      if (!factoryVideo.paused) {
        wasPlaying = true;
        factoryVideo.pause();
      }
    } else if (wasPlaying && isVideoVisible) {
      // Page is visible again and video was playing - resume
      factoryVideo.play().catch(error => {
        console.log('Video resume failed:', error);
      });
    }
  });

  // Handle window focus/blur
  window.addEventListener('focus', () => {
    if (isVideoVisible && wasPlaying) {
      factoryVideo.play().catch(error => {
        console.log('Video resume on focus failed:', error);
      });
    }
  });

  window.addEventListener('blur', () => {
    if (!factoryVideo.paused) {
      wasPlaying = true;
      factoryVideo.pause();
    }
  });

  // Override play button to unmute and play
  const playBtn = document.getElementById('factory-video-play-btn');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      factoryVideo.muted = false;
      factoryVideo.play()
        .then(() => {
          playBtn.style.display = 'none';
          factoryVideo.scrollIntoView({ behavior: 'smooth', block: 'center' });
        })
        .catch(error => {
          console.log('Manual video play failed:', error);
        });
    });
  }

  // Update video duration display
  factoryVideo.addEventListener('loadedmetadata', () => {
    const durationElement = document.getElementById('factory-video-duration');
    if (durationElement) {
      const minutes = Math.floor(factoryVideo.duration / 60);
      const seconds = Math.floor(factoryVideo.duration % 60);
      durationElement.textContent = `时长：${minutes}:${seconds.toString().padStart(2, '0')}分钟`;
    }
  });

  // Handle video end
  factoryVideo.addEventListener('ended', () => {
    // Reset to beginning and mute for next autoplay
    factoryVideo.currentTime = 0;
    factoryVideo.muted = true;
    if (playBtn) playBtn.style.display = 'block';
  });

  // Handle video play/pause events
  factoryVideo.addEventListener('play', () => {
    if (playBtn) playBtn.style.display = 'none';
  });

  factoryVideo.addEventListener('pause', () => {
    // Only show play button if not at the end
    if (factoryVideo.currentTime < factoryVideo.duration - 1 && playBtn) {
      playBtn.style.display = 'block';
    }
  });
}

// Start product-section visibility tracking once DOM is ready.
// This enables `userActivity.inProductSection` to reflect reality so that
// timeOnProductSection and non-link click counting work correctly.
document.addEventListener('DOMContentLoaded', () => {
  setupProductSectionTracking();
  
  // 初始化骨架屏系统
  if (window.skeletonScreen && typeof window.skeletonScreen.init === 'function') {
    window.skeletonScreen.init();
  }

  // 初始化视频焦点控制系统
  setupVideoFocusControl();
});
