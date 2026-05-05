import { test, expect } from '@playwright/test';

test('simple test - check if localhost is accessible', async ({ page }) => {
  // Test if we can access the localhost
  const response = await page.goto('http://localhost:4200');
  
  if (response) {
    console.log('Page loaded successfully');
    expect(response.status()).toBe(200);
    
    // Wait a bit for Angular to load
    await page.waitForTimeout(3000);
    
    // Take a screenshot to see what's on the page
    await page.screenshot({ path: 'test-screenshot.png' });
    
    console.log('Screenshot taken');
  } else {
    console.log('Failed to load page');
  }
});
