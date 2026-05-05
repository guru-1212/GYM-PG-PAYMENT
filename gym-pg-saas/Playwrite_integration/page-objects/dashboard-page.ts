import { Page, expect } from '@playwright/test';

export class DashboardPage {
  constructor(private page: Page) {}

  // Navigation elements
  get membersTab() {
    return this.page.locator('a[href="/members"], nav a:has-text("Members"), sidebar a:has-text("Members")');
  }

  get dashboardTitle() {
    return this.page.locator('h1:has-text("Dashboard"), .dashboard-title');
  }

  get sidebar() {
    return this.page.locator('nav, .sidebar, [role="navigation"]');
  }

  // Actions
  async navigateToMembers() {
    // Try different possible selectors for members navigation
    const membersSelectors = [
      'a[href="/members"]',
      'nav a:has-text("Members")',
      'sidebar a:has-text("Members")',
      '.sidebar a:has-text("Members")',
      '[data-testid="members-nav"]',
      '[data-nav="members"]'
    ];

    for (const selector of membersSelectors) {
      const element = this.page.locator(selector);
      if (await element.isVisible()) {
        await element.click();
        await this.page.waitForURL('**/members', { timeout: 10000 });
        return;
      }
    }

    // Fallback: try to find by text content
    const membersLink = this.page.locator('a').filter({ hasText: 'Members' }).first();
    if (await membersLink.isVisible()) {
      await membersLink.click();
      await this.page.waitForURL('**/members', { timeout: 10000 });
      return;
    }

    throw new Error('Members navigation link not found');
  }

  // Assertions
  async assertDashboardVisible() {
    await expect(this.page).toHaveURL(/dashboard/);
    await expect(this.dashboardTitle).toBeVisible();
  }

  async assertSidebarVisible() {
    await expect(this.sidebar).toBeVisible();
  }

  async assertMembersTabVisible() {
    await expect(this.membersTab).toBeVisible();
  }

  // Helper methods
  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(2000); // Wait for Angular to fully load
  }

  isOnDashboard(): Promise<boolean> {
    return this.page.locator('h1:has-text("Dashboard")').isVisible();
  }
}
