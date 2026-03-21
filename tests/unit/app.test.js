/**
 * Unit tests for App class
 */
import { App } from '../../src/assets/main.js';

describe('App Class', () => {
  let app;

  beforeEach(() => {
    app = new App();
    document.body.innerHTML = '<main id="main-content"></main>';
  });

  afterEach(() => {
    app = null;
    document.body.innerHTML = '';
  });

  describe('module registration', () => {
    it('should register modules correctly', () => {
      const mockModule = { init: jest.fn() };

      app.registerModule('testModule', mockModule);

      expect(app.modules.has('testModule')).toBe(true);
    });

    it('should allow registering multiple modules', () => {
      const module1 = { init: jest.fn() };
      const module2 = { init: jest.fn() };

      app.registerModule('module1', module1);
      app.registerModule('module2', module2);

      expect(app.modules.size).toBe(2);
    });
  });

  describe('initialization', () => {
    it('should initialize all registered modules', async () => {
      const module1 = { init: jest.fn().mockResolvedValue() };
      const module2 = { init: jest.fn().mockResolvedValue() };

      app.registerModule('module1', module1);
      app.registerModule('module2', module2);

      await app.initialize();

      expect(module1.init).toHaveBeenCalled();
      expect(module2.init).toHaveBeenCalled();
    });

    it('should handle modules without init function', async () => {
      const module1 = { init: jest.fn().mockResolvedValue() };
      const module2 = {}; // No init function

      app.registerModule('module1', module1);
      app.registerModule('module2', module2);

      await app.initialize();

      expect(module1.init).toHaveBeenCalled();
    });

    it('should mark as initialized after successful initialization', async () => {
      const module = { init: jest.fn().mockResolvedValue() };

      app.registerModule('testModule', module);
      await app.initialize();

      expect(app.initialized).toBe(true);
    });

    it('should not initialize twice', async () => {
      const module = { init: jest.fn().mockResolvedValue() };

      app.registerModule('testModule', module);

      await app.initialize();
      await app.initialize();

      expect(module.init).toHaveBeenCalledTimes(1);
    });

    it('should add loaded class to main element', async () => {
      const module = { init: jest.fn().mockResolvedValue() };

      app.registerModule('testModule', module);
      await app.initialize();

      const main = document.querySelector('main');
      expect(main.classList.contains('loaded')).toBe(true);
    });

    it('should handle initialization errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const module = { init: jest.fn().mockRejectedValue(new Error('Module error')) };

      app.registerModule('testModule', module);

      await app.initialize();

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(app.initialized).toBe(false);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('module lifecycle', () => {
    it('should initialize modules in registration order', async () => {
      const order = [];

      const module1 = {
        init: jest.fn().mockImplementation(async () => {
          order.push('module1');
        }),
      };

      const module2 = {
        init: jest.fn().mockImplementation(async () => {
          order.push('module2');
        }),
      };

      const module3 = {
        init: jest.fn().mockImplementation(async () => {
          order.push('module3');
        }),
      };

      app.registerModule('module1', module1);
      app.registerModule('module2', module2);
      app.registerModule('module3', module3);

      await app.initialize();

      expect(order).toEqual(['module1', 'module2', 'module3']);
    });

    it('should continue initializing other modules if one fails', async () => {
      const module1 = { init: jest.fn().mockResolvedValue() };
      const module2 = { init: jest.fn().mockRejectedValue(new Error('Error')) };
      const module3 = { init: jest.fn().mockResolvedValue() };

      app.registerModule('module1', module1);
      app.registerModule('module2', module2);
      app.registerModule('module3', module3);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await app.initialize();

      expect(module1.init).toHaveBeenCalled();
      expect(module2.init).toHaveBeenCalled();
      expect(module3.init).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });
});
