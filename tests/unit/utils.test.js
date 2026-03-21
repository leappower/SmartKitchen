/**
 * Unit tests for utility functions
 */
import { debounce, throttle, formatCurrency, formatDate, escapeHtml, isValidEmail, isValidPhone, getLocalStorageItem, setLocalStorageItem } from '../../src/assets/common.js';

describe('Utility Functions', () => {
  describe('debounce', () => {
    jest.useFakeTimers();

    it('should delay function execution', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 300);

      debouncedFn();
      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(300);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should cancel previous calls', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 300);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      jest.advanceTimersByTime(300);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('throttle', () => {
    jest.useFakeTimers();

    it('should limit function execution rate', () => {
      const mockFn = jest.fn();
      const throttledFn = throttle(mockFn, 300);

      throttledFn();
      expect(mockFn).toHaveBeenCalledTimes(1);

      throttledFn();
      expect(mockFn).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(300);

      throttledFn();
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('formatCurrency', () => {
    it('should format numbers as currency', () => {
      expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56');
      expect(formatCurrency(1234.56, 'CNY')).toBe('¥1,234.56');
      expect(formatCurrency(1234.56, 'EUR')).toBe('€1,234.56');
    });
  });

  describe('formatDate', () => {
    it('should format dates correctly', () => {
      const date = new Date('2024-01-15');
      expect(formatDate(date, 'zh-CN')).toBe('2024年1月15日');
      expect(formatDate(date, 'en-US')).toBe('1/15/2024');
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(escapeHtml('<div>content</div>')).toBe('&lt;div&gt;content&lt;/div&gt;');
    });

    it('should handle empty strings', () => {
      expect(escapeHtml('')).toBe('');
    });
  });

  describe('isValidEmail', () => {
    it('should validate email addresses', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('invalid-email')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });
  });

  describe('isValidPhone', () => {
    it('should validate phone numbers', () => {
      expect(isValidPhone('+86 138 1234 5678')).toBe(true);
      expect(isValidPhone('+1 555 123 4567')).toBe(true);
      expect(isValidPhone('invalid')).toBe(false);
    });
  });

  describe('getLocalStorageItem', () => {
    it('should get item from localStorage', () => {
      localStorage.setItem('testKey', 'testValue');
      const value = getLocalStorageItem('testKey');
      expect(value).toBe('testValue');
    });

    it('should return null for non-existent keys', () => {
      const value = getLocalStorageItem('nonExistentKey');
      expect(value).toBeNull();
    });

    it('should handle JSON parsing', () => {
      const obj = { key: 'value' };
      localStorage.setItem('testKey', JSON.stringify(obj));
      const value = getLocalStorageItem('testKey', true);
      expect(value).toEqual(obj);
    });
  });

  describe('setLocalStorageItem', () => {
    it('should set item to localStorage', () => {
      setLocalStorageItem('testKey', 'testValue');
      expect(localStorage.getItem('testKey')).toBe('testValue');
    });

    it('should stringify objects', () => {
      const obj = { key: 'value' };
      setLocalStorageItem('testKey', obj, true);
      expect(localStorage.getItem('testKey')).toBe(JSON.stringify(obj));
    });
  });
});
