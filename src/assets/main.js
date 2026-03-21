// main.js - Core functionality with modular architecture
class App {
  constructor() {
    this.modules = new Map();
    this.initialized = false;
  }

  registerModule(name, module) {
    this.modules.set(name, module);
  }

  async initialize() {
    if (this.initialized) return;

    let hasErrors = false;

    try {
      // Initialize all modules
      for (const [, module] of this.modules) {
        if (typeof module.init === 'function') {
          try {
            await module.init();
          } catch (moduleError) {
            console.error('Failed to initialize module:', moduleError);
            hasErrors = true;
          }
        }
      }

      // Only mark as initialized if no errors occurred
      if (!hasErrors) {
        // Mark main content as loaded to prevent FOUC
        const main = document.querySelector('main');
        if (main) {
          main.classList.add('loaded');
        }

        this.initialized = true;
      }
    } catch (error) {
      console.error('Failed to initialize app:', error);
      hasErrors = true;
    }
  }
}

// Create global app instance
const app = new App();

// Form Validation Module
class FormValidationModule {
  init() {
    this.setupFormValidation();
  }

  setupFormValidation() {
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
      form.addEventListener('submit', (e) => this.validateForm(e));
    });
  }

  validateForm(e) {
    const form = e.target;
    const requiredFields = form.querySelectorAll('[required]');
    let isValid = true;
    let firstInvalidField = null;

    requiredFields.forEach(field => {
      if (!field.value.trim()) {
        field.classList.add('error');
        if (!firstInvalidField) firstInvalidField = field;
        isValid = false;
      } else {
        field.classList.remove('error');
      }
    });

    if (!isValid) {
      e.preventDefault();
      firstInvalidField?.focus();
      this.showFormError('Please fill in all required fields');
    }
  }

  showFormError(message) {
    // Create or update error message element
    let errorEl = document.getElementById('form-error-message');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.id = 'form-error-message';
      errorEl.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      document.body.appendChild(errorEl);
    }

    errorEl.textContent = message;
    errorEl.style.display = 'block';

    setTimeout(() => {
      errorEl.style.display = 'none';
    }, 5000);
  }
}

// Lazy Loading Module
class LazyLoadingModule {
  constructor() {
    this._imageObserver = null;
    this._mutationObserver = null;
  }

  init() {
    this._imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.loadImage(entry.target);
          this._imageObserver.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '100px',
      threshold: 0,
    });

    // 观察当前已有的 data-src 图片
    this._observeImages(document);

    // 监听 DOM 变化，自动处理动态渲染的产品卡片图片
    this._mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this._observeImages(node);
          }
        });
      });
    });

    const productGrid = document.getElementById('product-grid');
    if (productGrid) {
      this._mutationObserver.observe(productGrid, { childList: true, subtree: true });
    } else {
      // product-grid 尚未渲染，监听整个 #products 区域
      const productsSection = document.getElementById('products');
      if (productsSection) {
        this._mutationObserver.observe(productsSection, { childList: true, subtree: true });
      }
    }
  }

  _observeImages(root) {
    const imgs = (root instanceof Element && root.matches('img[data-src]'))
      ? [root]
      : Array.from(root.querySelectorAll ? root.querySelectorAll('img[data-src]') : []);
    imgs.forEach(img => {
      if (!img.dataset.lazyObserved) {
        img.dataset.lazyObserved = '1';
        this._imageObserver.observe(img);
      }
    });
  }

  loadImage(img) {
    const src = img.dataset.src;
    if (!src) return;

    // 同时激活父级 <picture> 的 <source data-srcset>（WebP 路径）
    const picture = img.closest('picture');
    if (picture) {
      const source = picture.querySelector('source[type="image/webp"]');
      if (source && source.dataset && source.dataset.srcset) {
        source.srcset = source.dataset.srcset;
      }
    }

    img.src = src;
    img.classList.remove('lazy-loading', 'lazy-img');
    img.classList.add('loaded');

    img.addEventListener('load', () => {
      img.classList.add('fade-in');
    }, { once: true });

    img.addEventListener('error', () => {
      console.warn(`[LazyLoad] Failed to load image: ${src}`);
      // WebP 失败时降级到同名 PNG
      if (src.endsWith('.webp')) {
        img.src = src.replace(/\.webp$/i, '.png');
      } else {
        // PNG 也失败，显示占位符（内联 SVG，无需额外请求）
        img.src = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\'%3E%3Crect width=\'200\' height=\'200\' fill=\'%23f1f5f9\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%2394a3b8\' font-size=\'14\'%3E暂无图片%3C/text%3E%3C/svg%3E';
      }
    }, { once: true });
  }
}

// Error Handling Module
class ErrorHandlingModule {
  init() {
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    // Global error handler
    window.addEventListener('error', (e) => {
      console.error('JavaScript error:', e.error);
      this.reportError(e.error);
    });

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (e) => {
      console.error('Unhandled promise rejection:', e.reason);
      this.reportError(e.reason);
    });

    // Network error handler
    window.addEventListener('offline', () => {
      this.showNetworkStatus('You are currently offline', 'warning');
    });

    window.addEventListener('online', () => {
      this.showNetworkStatus('You are back online', 'success');
    });
  }

  reportError(error) {
    if (window.gtag) {
      window.gtag('event', 'exception', {
        description: error && error.message ? error.message : String(error),
        fatal: false
      });
    }
  }

  showNetworkStatus(message, type) {
    // Simple notification system
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 px-4 py-2 rounded-lg shadow-lg z-50 ${
      type === 'warning' ? 'bg-yellow-500' : 'bg-green-500'
    } text-white`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

// Register modules
app.registerModule('formValidation', new FormValidationModule());
app.registerModule('lazyLoading', new LazyLoadingModule());
app.registerModule('errorHandling', new ErrorHandlingModule());

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.initialize());
} else {
  app.initialize();
}

// Expose app instance for debugging
window.app = app;
// Export App class for testing
export { App };
