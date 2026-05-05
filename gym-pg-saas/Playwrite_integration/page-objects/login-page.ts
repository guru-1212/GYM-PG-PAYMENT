import { Page, expect } from '@playwright/test';
import { loginSelectors } from '../fixtures/test-data';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  async fillLoginForm(identifier: string, password: string) {
    await this.page.fill(loginSelectors.identifierInput, identifier);
    await this.page.fill(loginSelectors.passwordInput, password);
  }

  async clickSignInButton() {
    await this.page.click(loginSelectors.signInButton);
  }

  async login(identifier: string, password: string) {
    await this.fillLoginForm(identifier, password);
    await this.clickSignInButton();
  }

  async getErrorMessage() {
    return this.page.textContent(loginSelectors.errorMessage);
  }

  async waitForLoginSuccess() {
    // Wait for navigation to dashboard or any successful login indicator
    await this.page.waitForURL('**/dashboard', { timeout: 10000 });
  }

  async assertPageTitle() {
    await expect(this.page).toHaveTitle(/OurPGTracker|Login/);
  }

  async assertLoginFormVisible() {
    await expect(this.page.locator(loginSelectors.identifierInput)).toBeVisible();
    await expect(this.page.locator(loginSelectors.passwordInput)).toBeVisible();
    await expect(this.page.locator(loginSelectors.signInButton)).toBeVisible();
  }

  async assertErrorMessage(message: string) {
    const errorElement = this.page.locator(loginSelectors.errorMessage);
    await expect(errorElement).toBeVisible();
    await expect(errorElement).toContainText(message);
  }

  async togglePasswordVisibility() {
    await this.page.click('button[aria-label*="password"]');
  }

  async isPasswordVisible() {
    const passwordInput = this.page.locator(loginSelectors.passwordInput);
    const inputType = await passwordInput.getAttribute('type');
    return inputType === 'text';
  }

  async clickForgotPassword() {
    await this.page.click(loginSelectors.forgotPasswordLink);
  }
}
