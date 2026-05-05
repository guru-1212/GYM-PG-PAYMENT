import { test, expect } from '@playwright/test';
import { LoginPage } from '../page-objects/login-page';
import { testUsers } from '../fixtures/test-data';

test.describe('Login Page Tests', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('should display login form elements', async ({ page }) => {
    await loginPage.assertPageTitle();
    await loginPage.assertLoginFormVisible();
  });

  test('should show error for empty credentials', async ({ page }) => {
    await loginPage.login('', '');
    
    // Check for validation messages
    const identifierInput = page.locator('#identifier');
    const passwordInput = page.locator('#pw');
    
    await expect(identifierInput).toBeFocused();
    await expect(page.locator('text=Mobile/email or password is required')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await loginPage.login(testUsers.invalidUser.identifier, testUsers.invalidUser.password);
    
    await loginPage.assertErrorMessage('Mobile/email or password is incorrect. Please check and try again.');
  });

  test('should toggle password visibility', async ({ page }) => {
    await loginPage.fillLoginForm(testUsers.validUser.identifier, testUsers.validUser.password);
    
    // Initially password should be hidden
    expect(await loginPage.isPasswordVisible()).toBeFalsy();
    
    // Toggle visibility
    await loginPage.togglePasswordVisibility();
    expect(await loginPage.isPasswordVisible()).toBeTruthy();
    
    // Toggle back
    await loginPage.togglePasswordVisibility();
    expect(await loginPage.isPasswordVisible()).toBeFalsy();
  });

  test('should navigate to forgot password page', async ({ page }) => {
    await loginPage.clickForgotPassword();
    await expect(page).toHaveURL('/forgot-password');
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    // This test requires valid credentials
    // Update the testUsers.validUser with actual valid credentials
    // or set environment variables TEST_USER_IDENTIFIER and TEST_USER_PASSWORD
    
    await loginPage.login(testUsers.validUser.identifier, testUsers.validUser.password);
    
    // Wait for successful login and redirect to dashboard
    await loginPage.waitForLoginSuccess();
    
    // Verify we're on the dashboard
    await expect(page).toHaveURL('**/dashboard');
  });

  test('should handle form validation for email format', async ({ page }) => {
    await loginPage.fillLoginForm('invalid-email', 'password123');
    await loginPage.clickSignInButton();
    
    // Check for email validation error
    await expect(page.locator('text=Please enter a valid email address')).toBeVisible();
  });

  test('should handle form validation for password length', async ({ page }) => {
    await loginPage.fillLoginForm('test@example.com', '123');
    await loginPage.clickSignInButton();
    
    // Check for password validation error
    await expect(page.locator('text=Password must be at least 6 characters')).toBeVisible();
  });

  test('should switch between sign in and sign up modes', async ({ page }) => {
    // Initially in sign in mode
    await expect(page.locator('button:has-text("Sign In")')).toHaveClass(/bg-white/);
    
    // Click on sign up
    await page.click('button:has-text("Owner Sign Up")');
    
    // Now in sign up mode
    await expect(page.locator('button:has-text("Owner Sign Up")')).toHaveClass(/bg-white/);
    await expect(page.locator('input#name')).toBeVisible();
    await expect(page.locator('input#businessName')).toBeVisible();
    await expect(page.locator('input#sphone')).toBeVisible();
    await expect(page.locator('input#semail')).toBeVisible();
  });
});
