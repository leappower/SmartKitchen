module.exports = {
  // Test environment
  testEnvironment: 'jsdom',

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Module paths
  moduleDirectories: ['node_modules', '<rootDir>/src'],

  // Transform files
  transform: {
    '^.+\\.js$': 'babel-jest',
  },

  // File extensions
  moduleFileExtensions: ['js', 'json'],

  // Test match patterns
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.js',
    '<rootDir>/src/**/*.{spec,test}.js',
    '<rootDir>/tests/**/*.test.js',
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!src/translations/**/*.json',
  ],

  // Coverage thresholds
  // These thresholds reflect the current test coverage baseline.
  // As more unit tests are added, these values should be raised accordingly.
  coverageThreshold: {
    global: {
      branches: 2,
      functions: 4,
      lines: 3,
      statements: 3,
    },
  },

  // Ignore patterns
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],

  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Reset mocks between tests
  resetMocks: true,

  // Restore mocks between tests
  restoreMocks: true,
};
