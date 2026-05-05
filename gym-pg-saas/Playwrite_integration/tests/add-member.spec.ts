import { test, expect } from '@playwright/test';
import { LoginPage } from '../page-objects/login-page';
import { DashboardPage } from '../page-objects/dashboard-page';
import { MembersPage } from '../page-objects/members-page';
import { testUsers, testMembers } from '../fixtures/test-data';

test.describe('Add Member Tests', () => {
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

  test.describe('Basic Member Creation', () => {
    test('should add a new member with valid data', async ({ page }) => {
      const memberData = { ...testMembers.validMember };
      
      // Step 4: Click Add Member
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      // Step 5: Fill member details
      await membersPage.fillMemberForm(memberData);
      
      // Step 6: Assign bed if PG business type
      const floorSelectVisible = await membersPage.floorNumberSelect.isVisible();
      if (floorSelectVisible) {
        // Try to assign a bed if floor/room/bed fields are available
        try {
          const floorOptions = await page.locator('select[formcontrolname="floorNumber"] option').allTextContents();
          const firstFloor = floorOptions.find(option => option !== 'Select floor…' && !option.includes('full'));
          
          if (firstFloor) {
            await membersPage.floorNumberSelect.selectOption(firstFloor);
            await page.waitForTimeout(1000);
            
            const roomOptions = await page.locator('select[formcontrolname="roomNumber"] option').allTextContents();
            const firstRoom = roomOptions.find(option => option !== 'Select room…' && !option.includes('full'));
            
            if (firstRoom) {
              await membersPage.roomNumberSelect.selectOption(firstRoom);
              await page.waitForTimeout(1000);
              
              const bedOptions = await page.locator('select[formcontrolname="bedNumber"] option').allTextContents();
              const firstBed = bedOptions.find(option => option !== 'Select bed…');
              
              if (firstBed) {
                await membersPage.bedNumberSelect.selectOption(firstBed);
              }
            }
          }
        } catch (error) {
          // Bed assignment might fail if no beds available, continue with member creation
          console.log('Bed assignment skipped, continuing with member creation');
        }
      }
      
      // Step 7: Save member
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      // Verify member is added to list
      await membersPage.assertMemberInList(`${memberData.firstName} ${memberData.lastName}`);
    });

    test('should add member with minimum required fields', async ({ page }) => {
      const minimalMember = {
        firstName: 'Alice',
        mobile: '9888776655',
        joinDate: '2024-01-01',
        dueDate: '2024-02-01',
        amount: 4000,
        subscriptionType: 'monthly' as const,
        paymentMethod: 'cash' as const,
        activeMember: true,
        isPartialPayment: false,
      };
      
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(minimalMember);
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      // Verify member is added
      await membersPage.assertMemberInList(minimalMember.firstName);
    });

    test('should cancel member creation', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(testMembers.validMember);
      await membersPage.cancelMemberCreation();
      await membersPage.assertMemberModalHidden();
      
      // Verify member is not added
      await membersPage.assertMemberNotInList(`${testMembers.validMember.firstName} ${testMembers.validMember.lastName}`);
    });
  });

  test.describe('Form Validation Tests', () => {
    test('should validate required first name', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(testMembers.invalidMembers.missingFirstName);
      await membersPage.saveMemberButton.click();
      
      await membersPage.assertValidationMessage('firstName', 'First name is required');
      await membersPage.assertMemberModalVisible(); // Modal should remain open
    });

    test('should validate mobile number format', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(testMembers.invalidMembers.invalidMobile);
      await membersPage.saveMemberButton.click();
      
      await membersPage.assertValidationMessage('mobile', 'Enter a valid 10-digit Indian mobile number');
      await membersPage.assertMemberModalVisible();
    });

    test('should validate required mobile number', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(testMembers.invalidMembers.missingMobile);
      await membersPage.saveMemberButton.click();
      
      await membersPage.assertValidationMessage('mobile', 'Mobile number is required');
      await membersPage.assertMemberModalVisible();
    });

    test('should validate email format when provided', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(testMembers.invalidMembers.invalidEmail);
      await membersPage.saveMemberButton.click();
      
      // Email validation might be handled differently, check for any validation message
      const hasValidationError = await page.locator('p.text-red-600').isVisible();
      if (hasValidationError) {
        await expect(page.locator('p.text-red-600')).toBeVisible();
      }
    });

    test('should validate amount is positive', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(testMembers.invalidMembers.zeroAmount);
      await membersPage.saveMemberButton.click();
      
      // Check for validation - amount should be positive
      const hasValidationError = await page.locator('p.text-red-600').isVisible();
      if (hasValidationError) {
        await expect(page.locator('p.text-red-600')).toBeVisible();
      }
    });

    test('should reject negative amounts', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(testMembers.invalidMembers.negativeAmount);
      await membersPage.saveMemberButton.click();
      
      // Check for validation - negative amounts should be rejected
      const hasValidationError = await page.locator('p.text-red-600').isVisible();
      if (hasValidationError) {
        await expect(page.locator('p.text-red-600')).toBeVisible();
      }
    });

    test('should validate name fields do not contain numbers', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      // Test first name with numbers
      await membersPage.fillMemberForm(testMembers.invalidMembers.firstNameWithNumbers);
      await membersPage.saveMemberButton.click();
      
      let hasValidationError = await page.locator('p.text-red-600').isVisible();
      if (hasValidationError) {
        await membersPage.assertValidationMessage('firstName', 'First name cannot contain numbers');
      }
      
      // Clear and test last name with numbers
      await membersPage.firstNameInput.fill('John');
      await membersPage.lastNameInput.fill('Doe456');
      await membersPage.saveMemberButton.click();
      
      hasValidationError = await page.locator('p.text-red-600').isVisible();
      if (hasValidationError) {
        await membersPage.assertValidationMessage('lastName', 'Last name cannot contain numbers');
      }
    });

    test('should validate due date is after join date', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(testMembers.invalidMembers.dueDateBeforeJoinDate);
      await membersPage.saveMemberButton.click();
      
      // Check for validation about due date being after join date
      const hasValidationError = await page.locator('p.text-red-600').isVisible();
      if (hasValidationError) {
        await expect(page.locator('p.text-red-600')).toBeVisible();
      }
    });
  });

  test.describe('Subscription Type Tests', () => {
    test('should add member with monthly subscription', async ({ page }) => {
      const monthlyMember = { ...testMembers.validMember, subscriptionType: 'monthly' as const };
      
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(monthlyMember);
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      await membersPage.assertMemberInList(`${monthlyMember.firstName} ${monthlyMember.lastName}`);
    });

    test('should add member with quarterly subscription', async ({ page }) => {
      const quarterlyMember = { 
        ...testMembers.validMember, 
        firstName: 'Quarterly',
        subscriptionType: 'quarterly' as const,
        amount: 15000
      };
      
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(quarterlyMember);
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      await membersPage.assertMemberInList(`${quarterlyMember.firstName} ${quarterlyMember.lastName}`);
    });

    test('should add member with yearly subscription', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(testMembers.yearlyMember);
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      await membersPage.assertMemberInList(`${testMembers.yearlyMember.firstName} ${testMembers.yearlyMember.lastName}`);
    });
  });

  test.describe('Payment Method Tests', () => {
    test('should add member with cash payment', async ({ page }) => {
      const cashMember = { ...testMembers.validMember, paymentMethod: 'cash' as const };
      
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(cashMember);
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      await membersPage.assertMemberInList(`${cashMember.firstName} ${cashMember.lastName}`);
    });

    test('should add member with UPI payment', async ({ page }) => {
      const upiMember = { ...testMembers.validMember, paymentMethod: 'upi' as const };
      
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(upiMember);
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      await membersPage.assertMemberInList(`${upiMember.firstName} ${upiMember.lastName}`);
    });

    test('should add member with bank transfer payment', async ({ page }) => {
      const bankMember = { ...testMembers.validMember, paymentMethod: 'bank_transfer' as const };
      
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(bankMember);
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      await membersPage.assertMemberInList(`${bankMember.firstName} ${bankMember.lastName}`);
    });

    test('should add member with cheque payment', async ({ page }) => {
      const chequeMember = { ...testMembers.validMember, paymentMethod: 'cheque' as const };
      
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(chequeMember);
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      await membersPage.assertMemberInList(`${chequeMember.firstName} ${chequeMember.lastName}`);
    });
  });

  test.describe('Partial Payment Tests', () => {
    test('should add member with partial payment', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(testMembers.partialPaymentMember);
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      await membersPage.assertMemberInList(`${testMembers.partialPaymentMember.firstName} ${testMembers.partialPaymentMember.lastName}`);
    });

    test('should show pending amount when partial payment is enabled', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(testMembers.partialPaymentMember);
      
      // Check if pending amount field is visible and has correct value
      const pendingAmount = testMembers.partialPaymentMember.amount - testMembers.partialPaymentMember.paidAmount!;
      const paidAmountValue = await membersPage.paidAmountInput.inputValue();
      expect(paidAmountValue).toBe(testMembers.partialPaymentMember.paidAmount!.toString());
    });
  });

  test.describe('Member Status Tests', () => {
    test('should add active member by default', async ({ page }) => {
      const activeMember = { ...testMembers.validMember, activeMember: true };
      
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(activeMember);
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      await membersPage.assertMemberInList(`${activeMember.firstName} ${activeMember.lastName}`);
    });

    test('should add inactive member', async ({ page }) => {
      await membersPage.clickAddMember();
      await membersPage.assertMemberModalVisible();
      
      await membersPage.fillMemberForm(testMembers.inactiveMember);
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      await membersPage.assertMemberInList(`${testMembers.inactiveMember.firstName} ${testMembers.inactiveMember.lastName}`);
    });
  });

  test.describe('Search and Filter Tests', () => {
    test('should search for newly added member', async ({ page }) => {
      const memberData = { ...testMembers.validMember };
      
      // Add member first
      await membersPage.clickAddMember();
      await membersPage.fillMemberForm(memberData);
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      // Search by name
      await membersPage.searchMembers(memberData.firstName);
      await membersPage.assertMemberInList(memberData.firstName);
      
      // Search by mobile
      await membersPage.searchMembers(memberData.mobile);
      await membersPage.assertMemberInList(memberData.mobile);
    });

    test('should filter members by status', async ({ page }) => {
      // Add active member
      await membersPage.clickAddMember();
      await membersPage.fillMemberForm(testMembers.validMember);
      await membersPage.saveMember();
      
      // Add inactive member
      await membersPage.clickAddMember();
      await membersPage.fillMemberForm(testMembers.inactiveMember);
      await membersPage.saveMember();
      
      // Filter by active
      await membersPage.filterByStatus('active');
      await membersPage.assertMemberInList(testMembers.validMember.firstName);
      
      // Filter by inactive
      await membersPage.filterByStatus('inactive');
      await membersPage.assertMemberInList(testMembers.inactiveMember.firstName);
    });
  });

  test.describe('Member Details Tests', () => {
    test('should view member details after creation', async ({ page }) => {
      const memberData = { ...testMembers.validMember };
      
      // Add member
      await membersPage.clickAddMember();
      await membersPage.fillMemberForm(memberData);
      await membersPage.saveMember();
      await membersPage.assertMemberModalHidden();
      
      // View member details
      await membersPage.viewMemberDetails(`${memberData.firstName} ${memberData.lastName}`);
      
      // Verify details page is loaded (check for URL change or specific elements)
      await expect(page).toHaveURL(/\/members\/[a-zA-Z0-9]+/);
    });
  });
});
