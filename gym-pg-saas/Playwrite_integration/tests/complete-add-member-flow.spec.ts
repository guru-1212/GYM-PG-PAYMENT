import { test, expect } from '@playwright/test';
import { LoginPage } from '../page-objects/login-page';
import { DashboardPage } from '../page-objects/dashboard-page';
import { MembersPage } from '../page-objects/members-page';
import { testUsers, testMembers } from '../fixtures/test-data';

test.describe('Complete Add Member Flow - End to End Test', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;
  let membersPage: MembersPage;

  test('should complete full add member flow from login to successful member creation', async ({ page }) => {
    // Initialize page objects
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    membersPage = new MembersPage(page);

    // STEP 1: LOGIN
    console.log('🔐 Step 1: Logging in...');
    await loginPage.goto();
    await loginPage.login(testUsers.validUser.identifier, testUsers.validUser.password);
    await loginPage.waitForLoginSuccess();
    console.log('✅ Login successful');

    // STEP 2: VERIFY DASHBOARD AND NAVIGATE TO MEMBERS
    console.log('📊 Step 2: Navigating to Members via sidebar...');
    await dashboardPage.assertDashboardVisible();
    await dashboardPage.assertSidebarVisible();
    await dashboardPage.navigateToMembers();
    console.log('✅ Navigated to Members page');

    // STEP 3: VERIFY MEMBERS PAGE
    console.log('👥 Step 3: Verifying Members page...');
    await membersPage.assertMembersPageVisible();
    await membersPage.waitForMembersToLoad();
    console.log('✅ Members page loaded successfully');

    // STEP 4: CLICK ADD MEMBER
    console.log('➕ Step 4: Opening Add Member modal...');
    await membersPage.clickAddMember();
    await membersPage.assertMemberModalVisible();
    console.log('✅ Add Member modal opened');

    // STEP 5: FILL MEMBER DETAILS
    console.log('📝 Step 5: Filling member details...');
    const memberData = { ...testMembers.validMember };
    
    // Fill basic information
    await membersPage.firstNameInput.fill(memberData.firstName);
    console.log(`  ✅ First Name: ${memberData.firstName}`);
    
    await membersPage.lastNameInput.fill(memberData.lastName!);
    console.log(`  ✅ Last Name: ${memberData.lastName}`);
    
    await membersPage.mobileInput.fill(memberData.mobile);
    console.log(`  ✅ Mobile: ${memberData.mobile}`);
    
    if (memberData.email) {
      await membersPage.emailInput.fill(memberData.email);
      console.log(`  ✅ Email: ${memberData.email}`);
    }
    
    if (memberData.address) {
      await membersPage.addressInput.fill(memberData.address);
      console.log(`  ✅ Address: ${memberData.address}`);
    }

    // Fill dates
    await membersPage.joinDateInput.fill(memberData.joinDate);
    console.log(`  ✅ Join Date: ${memberData.joinDate}`);
    
    await membersPage.dueDateInput.fill(memberData.dueDate);
    console.log(`  ✅ Due Date: ${memberData.dueDate}`);

    // Fill payment information
    await membersPage.amountInput.fill(memberData.amount.toString());
    console.log(`  ✅ Amount: ₹${memberData.amount}`);
    
    if (memberData.advancePaid) {
      await membersPage.advancePaidInput.fill(memberData.advancePaid.toString());
      console.log(`  ✅ Advance Paid: ₹${memberData.advancePaid}`);
    }

    // Select subscription type
    if (memberData.subscriptionType) {
      await membersPage.subscriptionTypeSelect.selectOption(memberData.subscriptionType);
      console.log(`  ✅ Subscription Type: ${memberData.subscriptionType}`);
    }

    // Select payment method
    if (memberData.paymentMethod) {
      await membersPage.paymentMethodSelect.selectOption(memberData.paymentMethod);
      console.log(`  ✅ Payment Method: ${memberData.paymentMethod}`);
    }

    // Set member status
    if (memberData.activeMember !== undefined) {
      const isChecked = await membersPage.activeMemberCheckbox.isChecked();
      if (isChecked !== memberData.activeMember) {
        await membersPage.activeMemberCheckbox.click();
      }
      console.log(`  ✅ Active Member: ${memberData.activeMember}`);
    }

    console.log('✅ Member details filled successfully');

    // STEP 6: ASSIGN BED (IF PG BUSINESS TYPE)
    console.log('🛏️ Step 6: Attempting bed assignment...');
    const floorSelectVisible = await membersPage.floorNumberSelect.isVisible();
    
    if (floorSelectVisible) {
      console.log('  🏢 PG business detected - assigning bed...');
      
      try {
        // Select floor
        const floorOptions = await page.locator('select[formcontrolname="floorNumber"] option').allTextContents();
        const firstFloor = floorOptions.find(option => option !== 'Select floor…' && !option.includes('full'));
        
        if (firstFloor) {
          await membersPage.floorNumberSelect.selectOption(firstFloor);
          console.log(`  ✅ Floor selected: ${firstFloor}`);
          await page.waitForTimeout(1000);
          
          // Select room
          const roomOptions = await page.locator('select[formcontrolname="roomNumber"] option').allTextContents();
          const firstRoom = roomOptions.find(option => option !== 'Select room…' && !option.includes('full'));
          
          if (firstRoom) {
            await membersPage.roomNumberSelect.selectOption(firstRoom);
            console.log(`  ✅ Room selected: ${firstRoom}`);
            await page.waitForTimeout(1000);
            
            // Select bed
            const bedOptions = await page.locator('select[formcontrolname="bedNumber"] option').allTextContents();
            const firstBed = bedOptions.find(option => option !== 'Select bed…');
            
            if (firstBed) {
              await membersPage.bedNumberSelect.selectOption(firstBed);
              console.log(`  ✅ Bed selected: ${firstBed}`);
            } else {
              console.log('  ⚠️ No available beds found');
            }
          } else {
            console.log('  ⚠️ No available rooms found');
          }
        } else {
          console.log('  ⚠️ No available floors found');
        }
      } catch (error) {
        console.log('  ⚠️ Bed assignment failed, continuing with member creation');
      }
    } else {
      console.log('  🏋️ GYM business detected - skipping bed assignment');
    }

    // STEP 7: SAVE MEMBER
    console.log('💾 Step 7: Saving member...');
    await membersPage.saveMember();
    console.log('✅ Save button clicked');

    // STEP 8: VERIFY SUCCESS
    console.log('🔍 Step 8: Verifying member creation...');
    await membersPage.assertMemberModalHidden();
    console.log('✅ Modal closed successfully');

    // Wait for member to appear in list
    await page.waitForTimeout(2000);
    await membersPage.assertMemberInList(`${memberData.firstName} ${memberData.lastName}`);
    console.log(`✅ Member "${memberData.firstName} ${memberData.lastName}" found in list`);

    // STEP 9: FINAL VERIFICATION
    console.log('🎯 Step 9: Final verification...');
    
    // Verify member details in list
    const memberExists = await membersPage.isMemberPresent(`${memberData.firstName} ${memberData.lastName}`);
    expect(memberExists).toBeTruthy();
    console.log('✅ Member successfully created and verified');

    // Get member count before and after (optional)
    const memberCount = await membersPage.getMemberCount();
    console.log(`📊 Total members in list: ${memberCount}`);

    console.log('🎉 COMPLETE ADD MEMBER FLOW SUCCESSFUL!');
    console.log(`👤 New Member: ${memberData.firstName} ${memberData.lastName}`);
    console.log(`📱 Mobile: ${memberData.mobile}`);
    console.log(`💰 Amount: ₹${memberData.amount}`);
    console.log(`📅 Join Date: ${memberData.joinDate}`);
    console.log(`📅 Due Date: ${memberData.dueDate}`);
  });

  test('should complete add member flow with minimal data', async ({ page }) => {
    // Initialize page objects
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    membersPage = new MembersPage(page);

    console.log('🚀 Starting minimal member creation flow...');

    // Login
    await loginPage.goto();
    await loginPage.login(testUsers.validUser.identifier, testUsers.validUser.password);
    await loginPage.waitForLoginSuccess();

    // Navigate to members
    await dashboardPage.navigateToMembers();
    await membersPage.assertMembersPageVisible();

    // Add member with minimal data
    await membersPage.clickAddMember();
    await membersPage.assertMemberModalVisible();

    const minimalMember = {
      firstName: 'Test',
      mobile: '9876543210',
      joinDate: '2024-01-01',
      dueDate: '2024-02-01',
      amount: 4000,
      subscriptionType: 'monthly' as const,
      paymentMethod: 'cash' as const,
      activeMember: true,
      isPartialPayment: false,
    };

    await membersPage.fillMemberForm(minimalMember);
    await membersPage.saveMember();
    await membersPage.assertMemberModalHidden();
    await membersPage.assertMemberInList(minimalMember.firstName);

    console.log('✅ Minimal member creation flow completed successfully');
  });
});
