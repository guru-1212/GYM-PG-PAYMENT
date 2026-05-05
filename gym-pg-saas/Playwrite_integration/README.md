# Playwright E2E Testing

This directory contains end-to-end tests for the GYM-PG-PAYMENT application using Playwright.

## Setup

### Prerequisites
- Node.js installed
- Angular application running on `http://localhost:4200`

### Installation
```bash
npm install @playwright/test
npx playwright install
```

### Environment Configuration
1. Copy `.env.example` to `.env`
2. Update `.env` with your test credentials:
```bash
cp .env.example .env
```

## Running Tests

### From the main project directory:
```bash
# Run all tests
npm run test:e2e

# Run tests with UI mode
npm run test:e2e:ui

# View test report
npm run test:e2e:report
```

### From the Playwright directory:
```bash
# Run all tests
npx playwright test

# Run specific test file
npx playwright test tests/login.spec.ts

# Run tests with UI mode
npx playwright test --ui

# Run tests in headed mode (show browser)
npx playwright test --headed

# Run tests on specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Generate test report
npx playwright show-report
```

## Test Structure

```
Playwrite_integration/
├── tests/              # Test files
│   └── login.spec.ts   # Login page tests
├── fixtures/           # Test data and utilities
│   └── test-data.ts    # Test users and selectors
├── page-objects/       # Page Object Model
│   └── login-page.ts   # Login page interactions
├── playwright.config.ts # Playwright configuration
├── .env.example        # Environment variables template
└── README.md          # This file
```

## Test Coverage

### Login Page Tests
- ✅ Display login form elements
- ✅ Validation for empty credentials
- ✅ Validation for invalid credentials
- ✅ Password visibility toggle
- ✅ Forgot password navigation
- ✅ Successful login (requires valid credentials)
- ✅ Email format validation
- ✅ Password length validation
- ✅ Sign in/Sign up mode switching

## Configuration

### Base URL
Tests run against `http://localhost:4200` by default. This can be changed in `playwright.config.ts`.

### Browsers
Tests run on:
- Chromium (Chrome)
- Firefox
- WebKit (Safari)
- Mobile Chrome
- Mobile Safari

### Reports
- HTML report: `playwright-report/index.html`
- JSON report: `test-results.json`
- Screenshots and videos on failure

## Best Practices

1. **Use Page Object Model**: All page interactions are in the `page-objects` directory
2. **Environment Variables**: Store sensitive credentials in `.env` file
3. **Selective Testing**: Use `test.only` for debugging specific tests
4. **CI/CD**: Tests run in headless mode by default in CI environments

## Adding New Tests

1. Create test files in the `tests/` directory
2. Use descriptive test names
3. Follow the Page Object Model pattern
4. Add test data to `fixtures/test-data.ts`
5. Update this README with new test coverage

## Troubleshooting

### Tests fail with "No element found"
- Ensure the Angular app is running on `http://localhost:4200`
- Check if selectors are correct in `fixtures/test-data.ts`

### Tests timeout
- Increase timeout in `playwright.config.ts`
- Check if the app is taking longer to load

### Browser not found
- Run `npx playwright install` to install browsers
- Check if browsers are installed correctly
