# Tests

This directory contains test files for the project.

## Test Structure

```
tests/
├── unit/              # Unit tests
│   ├── utils.test.js
│   ├── translations.test.js
│   └── main.test.js
├── integration/       # Integration tests
│   └── app.test.js
└── __fixtures__/      # Test fixtures
    └── data.js
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- utils.test.js
```

## Writing Tests

### Unit Tests

```javascript
describe('Utility Function', () => {
  it('should return expected result', () => {
    const result = myFunction('input');
    expect(result).toBe('output');
  });
});
```

### Integration Tests

```javascript
describe('App Integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('should initialize app correctly', async () => {
    const app = new App();
    await app.initialize();
    expect(app.initialized).toBe(true);
  });
});
```

## Coverage Goals

- Branches: 60%
- Functions: 60%
- Lines: 60%
- Statements: 60%
