import { Page, expect } from '@playwright/test';

export class HomePage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  async clickSignInDropdown() {
    await this.page.click('button:has-text("Sign in")');
  }

  async selectOwnerSignIn() {
    await this.page.click('a:has-text("Owner / supervisor")');
  }

  async selectAdminSignIn() {
    await this.page.click('a:has-text("Admin")');
  }

  async selectTenantSignIn() {
    await this.page.click('a:has-text("Tenant")');
  }

  async signInAsOwner() {
    await this.clickSignInDropdown();
    await this.selectOwnerSignIn();
  }

  async assertPageTitle() {
    await expect(this.page).toHaveTitle(/Our PG Tracker/);
  }

  async assertHomePageVisible() {
    await expect(this.page.locator('text=Built for PG & Hostel Owners')).toBeVisible();
    await expect(this.page.locator('text=Our PG Tracker')).toBeVisible();
  }

  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(2000); // Wait for Angular to fully load
  }
}
