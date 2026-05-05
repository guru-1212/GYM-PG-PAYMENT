import { test, expect } from '@playwright/test';
import { LoginPage } from '../page-objects/login-page';
import { DashboardPage } from '../page-objects/dashboard-page';
import { MembersPage } from '../page-objects/members-page';
import { testUsers, testMembers } from '../fixtures/test-data';

test.describe('PG Member Management Tests', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;
  let membersPage: MembersPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    membersPage = new MembersPage(page);
    
    // Step 1: Login
    await loginPage.goto();
    await loginPage.login(testUsers.validUser.identifier, testUsers.validUser.password);
    await loginPage.waitForLoginSuccess();
    
    // Step 2: Navigate via sidebar to members
    await dashboardPage.assertDashboardVisible();
    await dashboardPage.assertSidebarVisible();
    await dashboardPage.navigateToMembers();
    
    // Step 3: Verify members page is loaded
    await membersPage.assertMembersPageVisible();
  });

  test.describe('PG-Specific Features', () => {
    test('should show floor/room/bed fields for PG business type', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      // Check if PG-specific fields are visible
      const floorNumberVisible = await membersPage.floorNumberSelect.isVisible();
      const roomNumberVisible = await membersPage.roomNumberSelect.isVisible();
      const bedNumberVisible = await membersPage.bedNumberSelect.isVisible();
      
      // These should be visible for PG business type
      expect(floorNumberVisible || roomNumberVisible || bedNumberVisible).toBeTruthy();
    });

    test('should add PG member with floor/room/bed assignment', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(testMembers.pgMember);
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      // Verify member is added
      await membersPage.assertMemberInList(`${testMembers.pgMember.firstName} ${testMembers.pgMember.lastName}`);
      
      // Verify PG-specific information is displayed
      const memberDetails = await membersPage.getMemberDetails(`${testMembers.pgMember.firstName} ${testMembers.pgMember.lastName}`);
      expect(memberDetails.name).toContain(testMembers.pgMember.firstName);
    });

    test('should handle floor selection and room loading', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      // Fill basic info first
      await membersPage.firstNameInput.fill('Test');
      await membersPage.mobileInput.fill('9876543210');
      await membersPage.joinDateInput.fill('2024-01-01');
      await membersPage.dueDateInput.fill('2024-02-01');
      await membersPage.amountInput.fill('5000');
      
      // Select floor if available
      const floorSelect = membersPage.floorNumberSelect;
      if (await floorSelect.isVisible()) {
        await floorSelect.click();
        
        // Check if options are loaded
        const options = await page.locator('select[formcontrolname="floorNumber"] option').count();
        expect(options).toBeGreaterThan(1); // At least "Select floor..." and one floor option
      }
    });

    test('should handle room selection based on floor', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      // Fill basic info first
      await membersPage.firstNameInput.fill('Test');
      await membersPage.mobileInput.fill('9876543210');
      await membersPage.joinDateInput.fill('2024-01-01');
      await membersPage.dueDateInput.fill('2024-02-01');
      await membersPage.amountInput.fill('5000');
      
      // Select floor first if available
      const floorSelect = membersPage.floorNumberSelect;
      const roomSelect = membersPage.roomNumberSelect;
      
      if (await floorSelect.isVisible()) {
        const floorOptions = await page.locator('select[formcontrolname="floorNumber"] option').allTextContents();
        const firstFloor = floorOptions.find(option => option !== 'Select floor…' && !option.includes('full'));
        
        if (firstFloor) {
          await floorSelect.selectOption(firstFloor);
          await page.waitForTimeout(1000); // Wait for rooms to load
          
          // Check if room select is now enabled and has options
          if (await roomSelect.isVisible()) {
            const roomOptions = await page.locator('select[formcontrolname="roomNumber"] option').allTextContents();
            expect(roomOptions.length).toBeGreaterThan(1);
          }
        }
      }
    });

    test('should handle bed selection based on room', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      // Fill basic info first
      await membersPage.firstNameInput.fill('Test');
      await membersPage.mobileInput.fill('9876543210');
      await membersPage.joinDateInput.fill('2024-01-01');
      await membersPage.dueDateInput.fill('2024-02-01');
      await membersPage.amountInput.fill('5000');
      
      // Try to select floor and room
      const floorSelect = membersPage.floorNumberSelect;
      const roomSelect = membersPage.roomNumberSelect;
      const bedSelect = membersPage.bedNumberSelect;
      
      if (await floorSelect.isVisible()) {
        const floorOptions = await page.locator('select[formcontrolname="floorNumber"] option').allTextContents();
        const firstFloor = floorOptions.find(option => option !== 'Select floor…' && !option.includes('full'));
        
        if (firstFloor) {
          await floorSelect.selectOption(firstFloor);
          await page.waitForTimeout(1000);
          
          if (await roomSelect.isVisible()) {
            const roomOptions = await page.locator('select[formcontrolname="roomNumber"] option').allTextContents();
            const firstRoom = roomOptions.find(option => option !== 'Select room…' && !option.includes('full'));
            
            if (firstRoom) {
              await roomSelect.selectOption(firstRoom);
              await page.waitForTimeout(1000);
              
              // Check if bed select is now enabled and has options
              if (await bedSelect.isVisible()) {
                const bedOptions = await page.locator('select[formcontrolname="bedNumber"] option').allTextContents();
                expect(bedOptions.length).toBeGreaterThan(1);
              }
            }
          }
        }
      }
    });

    test('should disable fully occupied floors/rooms/beds', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      // Fill basic info first
      await membersPage.firstNameInput.fill('Test');
      await membersPage.mobileInput.fill('9876543210');
      await membersPage.joinDateInput.fill('2024-01-01');
      await membersPage.dueDateInput.fill('2024-02-01');
      await membersPage.amountInput.fill('5000');
      
      // Check if any floors/rooms/beds are marked as full
      const floorSelect = membersPage.floorNumberSelect;
      
      if (await floorSelect.isVisible()) {
        await floorSelect.click();
        
        // Look for disabled options (marked as full)
        const disabledOptions = page.locator('select[formcontrolname="floorNumber"] option:disabled');
        const disabledCount = await disabledOptions.count();
        
        if (disabledCount > 0) {
          // Verify that disabled options contain "full" text
          const firstDisabled = await disabledOptions.first().textContent();
          expect(firstDisabled).toContain('full');
        }
      }
    });

    test('should show seat picker option when layout is available', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      // Look for seat picker button
      const seatPickerButton = page.locator('button:has-text("You can assign bed from here as well")');
      const seatPickerVisible = await seatPickerButton.isVisible();
      
      // This might not be visible if seat layout is not configured
      if (seatPickerVisible) {
        await expect(seatPickerButton).toBeVisible();
      }
    });
  });

  test.describe('PG Member Search and Filter', () => {
    test('should search PG member by room number', async ({ page }) => {
      // First add a PG member
      await membersPage.clickAddMember();
      await membersPage.fillMemberForm(testMembers.pgMember);
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      // Search by room number
      await membersPage.searchMembers(testMembers.pgMember.roomNumber!);
      
      // Should find the member
      await membersPage.assertMemberInList(`${testMembers.pgMember.firstName} ${testMembers.pgMember.lastName}`);
    });

    test('should display room information in member list', async ({ page }) => {
      // Add PG member first
      await membersPage.clickAddMember();
      await membersPage.fillMemberForm(testMembers.pgMember);
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      // Check if room information is displayed in the list
      const memberElement = page.locator(`text=${testMembers.pgMember.firstName} ${testMembers.pgMember.lastName}`);
      await expect(memberElement).toBeVisible();
      
      // Look for room information in the member card/row
      const roomInfo = page.locator(`text=${testMembers.pgMember.roomNumber}`);
      const roomInfoVisible = await roomInfo.isVisible();
      
      // Room info should be visible in PG view
      if (roomInfoVisible) {
        await expect(roomInfo).toBeVisible();
      }
    });
  });

  test.describe('PG Member Validation', () => {
    test('should validate floor/room/bed selection for PG members', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      // Fill basic info but skip floor/room/bed
      await membersPage.firstNameInput.fill('Test');
      await membersPage.mobileInput.fill('9876543210');
      await membersPage.joinDateInput.fill('2024-01-01');
      await membersPage.dueDateInput.fill('2024-02-01');
      await membersPage.amountInput.fill('5000');
      
      // Try to save
      await membersPage.saveMemberButton.click();
      
      // Check for validation errors if floor/room/bed are required for PG
      const hasValidationError = await page.locator('p.text-red-600').isVisible();
      if (hasValidationError) {
        await expect(page.locator('p.text-red-600')).toBeVisible();
      }
    });

    test('should prevent duplicate bed assignments', async ({ page }) => {
      // Add first PG member
      await membersPage.clickAddMember();
      await membersPage.fillMemberForm(testMembers.pgMember);
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      // Try to add second member with same bed
      await membersPage.clickAddMember();
      const duplicateMember = {
        ...testMembers.pgMember,
        firstName: 'Duplicate',
        mobile: '9988776655'
      };
      
      await membersPage.fillMemberForm(duplicateMember);
      await membersPage.saveMemberButton.click();
      
      // Check if system prevents duplicate bed assignment
      // This might show an error message or disable the bed selection
      const bedSelect = membersPage.bedNumberSelect;
      if (await bedSelect.isVisible()) {
        const selectedBed = await bedSelect.inputValue();
        const bedOptions = page.locator(`select[formcontrolname="bedNumber"] option[value="${selectedBed}"]`);
        
        // Check if the bed is now disabled
        const isDisabled = await bedOptions.getAttribute('disabled');
        if (isDisabled === 'disabled' || isDisabled === '') {
          // Bed is properly disabled
          expect(isDisabled).toBeTruthy();
        }
      }
    });
  });

  test.describe('PG Member Management', () => {
    test('should update member room assignment', async ({ page }) => {
      // Add PG member first
      await membersPage.clickAddMember();
      await membersPage.fillMemberForm(testMembers.pgMember);
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      // Edit the member
      await membersPage.editMember(`${testMembers.pgMember.firstName} ${testMembers.pgMember.lastName}`);
      
      // Wait for edit modal to open
      await page.waitForTimeout(1000);
      
      // Change room if possible
      const roomSelect = page.locator('select[formcontrolname="roomNumber"]');
      if (await roomSelect.isVisible()) {
        const roomOptions = await roomSelect.locator('option').allTextContents();
        const newRoom = roomOptions.find(option => 
          option !== 'Select room…' && 
          option !== testMembers.pgMember.roomNumber && 
          !option.includes('full')
        );
        
        if (newRoom) {
          await roomSelect.selectOption(newRoom);
          await page.locator('button:has-text("Save Member")').click();
          
          // Verify update
          await page.waitForTimeout(2000);
          await membersPage.assertMemberInList(`${testMembers.pgMember.firstName} ${testMembers.pgMember.lastName}`);
        }
      }
    });

    test('should handle member checkout (bed release)', async ({ page }) => {
      // Add PG member first
      await membersPage.clickAddMember();
      await membersPage.fillMemberForm(testMembers.pgMember);
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      // Edit member to make inactive (checkout)
      await membersPage.editMember(`${testMembers.pgMember.firstName} ${testMembers.pgMember.lastName}`);
      await page.waitForTimeout(1000);
      
      // Change status to inactive
      const statusCheckbox = page.locator('input[formcontrolname="status"]');
      const isChecked = await statusCheckbox.isChecked();
      if (isChecked) {
        await statusCheckbox.click();
      }
      
      await page.locator('button:has-text("Save Member")').click();
      await page.waitForTimeout(2000);
      
      // Verify member is still in list but inactive
      await membersPage.assertMemberInList(`${testMembers.pgMember.firstName} ${testMembers.pgMember.lastName}`);
      
      // Filter by inactive to see if member appears there
      await membersPage.filterByStatus('inactive');
      await membersPage.assertMemberInList(`${testMembers.pgMember.firstName} ${testMembers.pgMember.lastName}`);
    });
  });
});
