/**
 * Common Utility Functions
 * Shared utilities used across the application
 */

/**
 * Debounce function execution
 */
export function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function execution
 */
export function throttle(func, limit = 100) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') {
    return unsafe;
  }

  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validate email address
 */
export function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Validate phone number
 */
export function isValidPhone(phone) {
  // Allow: +[country code] [numbers], [numbers] with spaces, dashes, parentheses
  // Examples: +86 138 1234 5678, +1 555 123 4567, +44-20-1234-5678
  const re = /^\+?[0-9]{1,4}[-\s]?[0-9]{1,4}[-\s]?[0-9]{3,9}([-\s]?[0-9]+)*$/;
  return re.test(phone);
}

/**
 * Format currency
 */
export function formatCurrency(amount, currency = 'CNY') {
  const localeMap = {
    'USD': 'en-US',
    'CNY': 'zh-CN',
    'EUR': 'en-US',  // Use US locale for EUR to get €1,234.56 format
    'GBP': 'en-GB',
    'JPY': 'ja-JP'
  };
  const locale = localeMap[currency] || 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

/**
 * Format date
 */
export function formatDate(date, locale = 'zh-CN') {
  const options = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };

  // For en-US, use short numeric format
  if (locale === 'en-US') {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(new Date(date));
  }

  return new Intl.DateTimeFormat(locale, options).format(new Date(date));
}

/**
 * Format number with thousand separator
 */
export function formatNumber(num, locale = 'zh-CN') {
  return new Intl.NumberFormat(locale).format(num);
}

/**
 * Deep clone object
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item));
  }

  if (obj instanceof Object) {
    const clonedObj = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
}

/**
 * Check if object is empty
 */
export function isEmpty(obj) {
  if (obj === null || obj === undefined) {
    return true;
  }

  if (Array.isArray(obj) || typeof obj === 'string') {
    return obj.length === 0;
  }

  if (typeof obj === 'object') {
    return Object.keys(obj).length === 0;
  }

  return false;
}

/**
 * Get value from object by path
 */
export function get(obj, path, defaultValue = undefined) {
  const keys = path.split('.');
  let result = obj;

  for (const key of keys) {
    if (result === null || result === undefined) {
      return defaultValue;
    }
    result = result[key];
  }

  return result !== undefined ? result : defaultValue;
}

/**
 * Set value in object by path
 */
export function set(obj, path, value) {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
  return obj;
}

/**
 * Sleep function
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 * Modified: maxRetries defaults to 1 (instead of 3)
 * Added: onFailure callback for retry failure handling
 */
export async function retry(fn, options = {}) {
  const {
    maxRetries = 1, // Changed from 3 to 1
    delay = 1000,
    backoff = 2,
    onRetry = () => {},
    onFailure = null, // New: callback for retry failure
  } = options;

  let lastError;
  const errors = []; // Track all errors for summary

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      errors.push({
        attempt: i + 1,
        error: error.message || String(error),
        timestamp: new Date().toISOString()
      });
      
      onRetry(i + 1, error);

      if (i < maxRetries - 1) {
        await sleep(delay * Math.pow(backoff, i));
      }
    }
  }

  // Retry failed - create summary
  const failureSummary = {
    totalAttempts: maxRetries,
    success: false,
    errors: errors,
    lastError: lastError?.message || String(lastError),
    timestamp: new Date().toISOString()
  };

  // Call onFailure callback if provided
  if (onFailure && typeof onFailure === 'function') {
    onFailure(failureSummary);
  }

  // Throw enhanced error with summary
  const enhancedError = new Error(`Retry failed after ${maxRetries} attempts. Last error: ${lastError?.message || String(lastError)}`);
  enhancedError.summary = failureSummary;
  throw enhancedError;
}

/**
 * Parse query string
 */
export function parseQueryString(url = window.location.href) {
  const queryString = url.split('?')[1];
  if (!queryString) {
    return {};
  }

  const params = {};
  const pairs = queryString.split('&');

  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    const decodedKey = decodeURIComponent(key);
    const decodedValue = value ? decodeURIComponent(value) : '';
    params[decodedKey] = decodedValue;
  }

  return params;
}

/**
 * Build query string
 */
export function buildQueryString(params) {
  const pairs = [];

  for (const [key, value] of Object.entries(params)) {
    const encodedKey = encodeURIComponent(key);
    const encodedValue = value ? encodeURIComponent(value) : '';
    pairs.push(`${encodedKey}=${encodedValue}`);
  }

  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}

/**
 * Check if element is in viewport
 */
export function isInViewport(element) {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Check if element is partially in viewport
 */
export function isPartiallyInViewport(element) {
  const rect = element.getBoundingClientRect();
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
    rect.left < (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Get scroll percentage
 */
export function getScrollPercentage() {
  const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  return docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
}

/**
 * Smooth scroll to element
 */
export function scrollToElement(element, offset = 0) {
  const top = element.getBoundingClientRect().top + window.pageYOffset - offset;
  window.scrollTo({ top, behavior: 'smooth' });
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    console.error('Clipboard API failed:', error);
  }

  // Fallback
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    document.execCommand('copy');
    document.body.removeChild(textArea);
    return true;
  } catch (error) {
    document.body.removeChild(textArea);
    return false;
  }
}

/**
 * Download file
 */
export function downloadFile(content, filename, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate unique ID
 */
export function generateId(prefix = '') {
  return `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * LocalStorage helper functions (for testing)
 */
export function getLocalStorageItem(key, parseJson = false) {
  try {
    const item = localStorage.getItem(key);
    if (item === null) {
      return null;
    }
    if (parseJson) {
      try {
        return JSON.parse(item);
      } catch {
        return item;
      }
    }
    return item;
  } catch (error) {
    console.error('Failed to get from localStorage:', error);
    return null;
  }
}

export function setLocalStorageItem(key, value, stringify = false) {
  try {
    const item = (stringify || typeof value === 'object') ? JSON.stringify(value) : value;
    localStorage.setItem(key, item);
    return true;
  } catch (error) {
    console.error('Failed to set to localStorage:', error);
    return false;
  }
}

/**
 * LocalStorage helpers
 */
export const storage = {
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      if (item === null) {
        return defaultValue;
      }
      try {
        return JSON.parse(item);
      } catch {
        return item;
      }
    } catch (error) {
      console.error('Failed to get from localStorage:', error);
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      const item = typeof value === 'object' ? JSON.stringify(value) : value;
      localStorage.setItem(key, item);
      return true;
    } catch (error) {
      console.error('Failed to set to localStorage:', error);
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('Failed to remove from localStorage:', error);
      return false;
    }
  },

  clear() {
    try {
      localStorage.clear();
      return true;
    } catch (error) {
      console.error('Failed to clear localStorage:', error);
      return false;
    }
  },
};

/**
 * SessionStorage helpers
 */
export const sessionStorage = {
  get(key, defaultValue = null) {
    try {
      const item = window.sessionStorage.getItem(key);
      if (item === null) {
        return defaultValue;
      }
      try {
        return JSON.parse(item);
      } catch {
        return item;
      }
    } catch (error) {
      console.error('Failed to get from sessionStorage:', error);
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      const item = typeof value === 'object' ? JSON.stringify(value) : value;
      window.sessionStorage.setItem(key, item);
      return true;
    } catch (error) {
      console.error('Failed to set to sessionStorage:', error);
      return false;
    }
  },

  remove(key) {
    try {
      window.sessionStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('Failed to remove from sessionStorage:', error);
      return false;
    }
  },

  clear() {
    try {
      window.sessionStorage.clear();
      return true;
    } catch (error) {
      console.error('Failed to clear sessionStorage:', error);
      return false;
    }
  },
};

/**
 * Check if device is mobile
 */
export function isMobile() {
  return window.innerWidth < 768;
}

/**
 * Check if device is tablet
 */
export function isTablet() {
  return window.innerWidth >= 768 && window.innerWidth < 1024;
}

/**
 * Check if device is desktop
 */
export function isDesktop() {
  return window.innerWidth >= 1024;
}

/**
 * Get device type
 */
export function getDeviceType() {
  if (isMobile()) return 'mobile';
  if (isTablet()) return 'tablet';
  return 'desktop';
}

/**
 * Detect browser
 */
export function detectBrowser() {
  const userAgent = navigator.userAgent;

  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
    return 'Chrome';
  }
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    return 'Safari';
  }
  if (userAgent.includes('Firefox')) {
    return 'Firefox';
  }
  if (userAgent.includes('Edg')) {
    return 'Edge';
  }
  if (userAgent.includes('Opera') || userAgent.includes('OPR')) {
    return 'Opera';
  }

  return 'Unknown';
}

/**
 * Detect OS
 */
export function detectOS() {
  const userAgent = navigator.userAgent;

  if (userAgent.includes('Windows')) {
    return 'Windows';
  }
  if (userAgent.includes('Mac OS')) {
    return 'macOS';
  }
  if (userAgent.includes('Linux')) {
    return 'Linux';
  }
  if (userAgent.includes('Android')) {
    return 'Android';
  }
  if (userAgent.includes('iOS')) {
    return 'iOS';
  }

  return 'Unknown';
}

/**
 * Get language from browser
 */
export function getBrowserLanguage() {
  return navigator.language || navigator.userLanguage || 'zh-CN';
}

/**
 * Compare arrays
 */
export function arraysEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Merge arrays without duplicates
 */
export function mergeUniqueArrays(...arrays) {
  const merged = [];
  const seen = new Set();

  for (const arr of arrays) {
    for (const item of arr) {
      if (!seen.has(item)) {
        seen.add(item);
        merged.push(item);
      }
    }
  }

  return merged;
}

/**
 * Remove duplicates from array
 */
export function removeDuplicates(array) {
  return [...new Set(array)];
}

/**
 * Group array by key
 */
export function groupBy(array, key) {
  return array.reduce((result, item) => {
    (result[item[key]] = result[item[key]] || []).push(item);
    return result;
  }, {});
}

/**
 * Sort array by key
 */
export function sortBy(array, key, order = 'asc') {
  return [...array].sort((a, b) => {
    if (order === 'asc') {
      return a[key] > b[key] ? 1 : -1;
    } else {
      return a[key] < b[key] ? 1 : -1;
    }
  });
}

// Export for global access
if (typeof window !== 'undefined') {
  window.common = {
    debounce,
    throttle,
    escapeHtml,
    isValidEmail,
    isValidPhone,
    formatCurrency,
    formatDate,
    formatNumber,
    deepClone,
    isEmpty,
    get,
    set,
    sleep,
    retry,
    parseQueryString,
    buildQueryString,
    isInViewport,
    isPartiallyInViewport,
    getScrollPercentage,
    scrollToElement,
    copyToClipboard,
    downloadFile,
    generateId,
    storage,
    sessionStorage,
    isMobile,
    isTablet,
    isDesktop,
    getDeviceType,
    detectBrowser,
    detectOS,
    getBrowserLanguage,
    arraysEqual,
    mergeUniqueArrays,
    removeDuplicates,
    groupBy,
    sortBy,
  };
}
