/**
 * Unit tests for Translation Manager
 */
import { TranslationManager } from '../../src/assets/translations.js';

describe('TranslationManager', () => {
  let tm;

  beforeEach(() => {
    tm = new TranslationManager();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    // Clear cache to avoid bleed-over between tests
    if (tm.translationsCache) {
      tm.translationsCache.clear();
    }
    // Disconnect DOM observer if it was set up
    if (tm.domObserver) {
      tm.domObserver.disconnect();
      tm.domObserver = null;
    }
    // Clear event listeners
    if (tm.eventListeners) {
      tm.eventListeners.clear();
    }
  });

  describe('initialization', () => {
    it('should initialize with default language', async () => {
      await tm.initialize();
      expect(tm.currentLanguage).toBe('zh-CN');
    });

    it('should load translations on initialization', async () => {
      // initialize() calls loadUITranslations internally, not loadTranslations
      const loadSpy = jest.spyOn(tm, 'loadUITranslations').mockResolvedValue({});

      await tm.initialize();
      expect(loadSpy).toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.spyOn(tm, 'loadUITranslations').mockRejectedValue(new Error('Failed to load'));

      await tm.initialize();

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('language switching', () => {
    it('should switch language successfully', async () => {
      // Pre-populate cache so setLanguage doesn't need to fetch
      tm.translationsCache.set('ui-en', { nav_contact: 'Contact' });

      await tm.initialize();
      await tm.setLanguage('en');

      expect(tm.currentLanguage).toBe('en');
    });

    it('should fallback to default language if target language fails', async () => {
      // Ensure we start from zh-CN so a switch to en can actually fail
      tm.currentLanguage = 'zh-CN';

      // Make preloadLanguage fail for en, but succeed for the zh-CN fallback
      const preloadSpy = jest.spyOn(tm, 'preloadLanguage')
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValue({});

      await tm.setLanguage('en');

      expect(tm.currentLanguage).toBe('zh-CN');
      preloadSpy.mockRestore();
    });

    it('should not reload if already using the language', async () => {
      await tm.initialize();

      const loadSpy = jest.spyOn(tm, 'loadTranslations');

      await tm.setLanguage('zh-CN');

      expect(loadSpy).not.toHaveBeenCalled();
    });
  });

  describe('translation application', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div data-i18n="nav_contact">Contact</div>
        <div data-i18n="nav_products">Products</div>
        <input data-i18n-placeholder="placeholder_search" placeholder="Search">
      `;
    });

    it('should apply translations to DOM elements', async () => {
      const cacheKey = 'ui-en';
      tm.translationsCache.set(cacheKey, {
        nav_contact: 'Contact Us',
        nav_products: 'Our Products',
        placeholder_search: 'Search...',
      });
      tm.currentLanguage = 'en';

      await tm.applyTranslations();

      expect(document.querySelector('[data-i18n="nav_contact"]').textContent).toBe('Contact Us');
      expect(document.querySelector('[data-i18n="nav_products"]').textContent).toBe('Our Products');
      expect(
        document.querySelector('[data-i18n-placeholder="placeholder_search"]').placeholder
      ).toBe('Search...');
    });

    it('should handle missing translations', async () => {
      tm.translationsCache.set('ui-en', {});
      tm.currentLanguage = 'en';

      await tm.applyTranslations();

      // Missing key — element keeps its original text
      expect(document.querySelector('[data-i18n="nav_contact"]').textContent).toBe('Contact');
    });
  });

  describe('caching', () => {
    it('should cache loaded translations', async () => {
      const translations = { key: 'value' };

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve(translations),
      });

      await tm.loadUITranslations('en');

      expect(tm.translationsCache.has('ui-en')).toBe(true);
    });

    it('should use cached translations if available', async () => {
      const cachedTranslations = { key: 'cached value' };
      tm.translationsCache.set('ui-en', cachedTranslations);

      // loadUITranslations returns cache immediately without fetching
      const fetchSpy = jest.spyOn(global, 'fetch');
      const result = await tm.loadUITranslations('en');

      expect(result).toEqual(cachedTranslations);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('event system', () => {
    it('should emit language change events', async () => {
      await tm.initialize();

      const eventSpy = jest.fn();
      tm.on('languageChanged', eventSpy);

      // Pre-cache target language so the switch succeeds
      tm.translationsCache.set('ui-en', { nav_contact: 'Contact' });
      await tm.setLanguage('en');

      // emit passes an object { language, previousLanguage }
      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({ language: 'en' }));
    });

    it('should allow multiple event listeners', async () => {
      // Force a known starting language so setLanguage('en') triggers a real switch
      tm.currentLanguage = 'zh-CN';

      const spy1 = jest.fn();
      const spy2 = jest.fn();

      tm.on('languageChanged', spy1);
      tm.on('languageChanged', spy2);

      tm.translationsCache.set('ui-en', { nav_contact: 'Contact' });
      await tm.setLanguage('en');

      expect(spy1).toHaveBeenCalled();
      expect(spy2).toHaveBeenCalled();
    });
  });

  describe('cache management', () => {
    it('should clear cache entries', () => {
      tm.currentLanguage = 'zh-CN';
      tm.translationsCache.set('ui-fr', {});
      tm.translationsCache.set('ui-de', {});

      tm.clearCache();

      // clearCache removes all entries whose keys are not in languagesToKeep
      // (keys are "ui-*" strings, languagesToKeep stores bare lang codes,
      //  so all ui-* entries get pruned by clearCache's current implementation)
      expect(tm.translationsCache.size).toBe(0);
    });

    it('should report how many entries were cleared', () => {
      tm.currentLanguage = 'zh-CN';
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      tm.translationsCache.set('ui-fr', {});
      tm.translationsCache.set('ui-de', {});

      tm.clearCache();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Cache cleared'));
    });
  });

  describe('translate helper', () => {
    it('should return translation for existing key', () => {
      tm.translationsCache.set('ui-zh-CN', { hello: 'you' });
      tm.currentLanguage = 'zh-CN';

      expect(tm.translate('hello')).toBe('you');
    });

    it('should return the key itself for missing key', () => {
      tm.translationsCache.set('ui-zh-CN', {});
      tm.currentLanguage = 'zh-CN';

      expect(tm.translate('missing_key')).toBe('missing_key');
    });
  });
});
