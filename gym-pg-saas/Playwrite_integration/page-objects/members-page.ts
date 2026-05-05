import { Page, expect } from '@playwright/test';

export class MembersPage {
  constructor(private page: Page) {}

  // Navigation
  async goto() {
    await this.page.goto('/members');
    await this.page.waitForLoadState('networkidle');
  }

  // Page elements
  get addMemberButton() {
    return this.page.locator('button:has-text("Add Member")');
  }

  get memberModal() {
    return this.page.locator('[role="dialog"]:has-text("Add Member")');
  }

  get firstNameInput() {
    return this.page.locator('input[formcontrolname="firstName"]');
  }

  get lastNameInput() {
    return this.page.locator('input[formcontrolname="lastName"]');
  }

  get mobileInput() {
    return this.page.locator('input[formcontrolname="mobile"]');
  }

  get emailInput() {
    return this.page.locator('input[formcontrolname="email"]');
  }

  get addressInput() {
    return this.page.locator('textarea[formcontrolname="address"]');
  }

  get floorNumberSelect() {
    return this.page.locator('select[formcontrolname="floorNumber"]');
  }

  get roomNumberSelect() {
    return this.page.locator('select[formcontrolname="roomNumber"]');
  }

  get bedNumberSelect() {
    return this.page.locator('select[formcontrolname="bedNumber"]');
  }

  get joinDateInput() {
    return this.page.locator('input[formcontrolname="joinDate"]');
  }

  get dueDateInput() {
    return this.page.locator('input[formcontrolname="dueDate"]');
  }

  get amountInput() {
    return this.page.locator('input[formcontrolname="amount"]');
  }

  get advancePaidInput() {
    return this.page.locator('input[formcontrolname="advancePaid"]');
  }

  get subscriptionTypeSelect() {
    return this.page.locator('select[formcontrolname="subscriptionType"]');
  }

  get paymentMethodSelect() {
    return this.page.locator('select[formcontrolname="paymentMethod"]');
  }

  get activeMemberCheckbox() {
    return this.page.locator('input[formcontrolname="status"]');
  }

  get partialPaymentCheckbox() {
    return this.page.locator('input[formcontrolname="isPartialPayment"]');
  }

  get paidAmountInput() {
    return this.page.locator('input[formcontrolname="paidAmount"]');
  }

  get saveMemberButton() {
    return this.page.locator('button:has-text("Save Member")');
  }

  get cancelButton() {
    return this.page.locator('button:has-text("Cancel")');
  }

  get membersList() {
    return this.page.locator('#member-table-*, #member-card-*, #member-mobile-*');
  }

  // Actions
  async clickAddMember() {
    await this.addMemberButton.click();
    await this.memberModal.waitFor({ state: 'visible' });
  }

  async fillMemberForm(memberData: {
    firstName: string;
    lastName?: string;
    mobile: string;
    email?: string;
    address?: string;
    floorNumber?: string;
    roomNumber?: string;
    bedNumber?: string;
    joinDate: string;
    dueDate: string;
    amount: number;
    advancePaid?: number;
    subscriptionType?: 'monthly' | 'quarterly' | 'yearly';
    paymentMethod?: 'cash' | 'upi' | 'bank_transfer' | 'cheque';
    activeMember?: boolean;
    isPartialPayment?: boolean;
    paidAmount?: number;
  }) {
    // Basic information
    await this.firstNameInput.fill(memberData.firstName);
    if (memberData.lastName) {
      await this.lastNameInput.fill(memberData.lastName);
    }
    await this.mobileInput.fill(memberData.mobile);
    if (memberData.email) {
      await this.emailInput.fill(memberData.email);
    }
    if (memberData.address) {
      await this.addressInput.fill(memberData.address);
    }

    // PG specific (floor/room/bed)
    if (memberData.floorNumber) {
      await this.floorNumberSelect.selectOption(memberData.floorNumber);
      await this.page.waitForTimeout(500); // Wait for rooms to load
    }
    if (memberData.roomNumber) {
      await this.roomNumberSelect.selectOption(memberData.roomNumber);
      await this.page.waitForTimeout(500); // Wait for beds to load
    }
    if (memberData.bedNumber) {
      await this.bedNumberSelect.selectOption(memberData.bedNumber);
    }

    // Dates
    await this.joinDateInput.fill(memberData.joinDate);
    await this.dueDateInput.fill(memberData.dueDate);

    // Payment information
    await this.amountInput.fill(memberData.amount.toString());
    if (memberData.advancePaid) {
      await this.advancePaidInput.fill(memberData.advancePaid.toString());
    }

    if (memberData.subscriptionType) {
      await this.subscriptionTypeSelect.selectOption(memberData.subscriptionType);
    }

    if (memberData.paymentMethod) {
      await this.paymentMethodSelect.selectOption(memberData.paymentMethod);
    }

    // Member status
    if (memberData.activeMember !== undefined) {
      const isChecked = await this.activeMemberCheckbox.isChecked();
      if (isChecked !== memberData.activeMember) {
        await this.activeMemberCheckbox.click();
      }
    }

    // Partial payment
    if (memberData.isPartialPayment) {
      await this.partialPaymentCheckbox.click();
      if (memberData.paidAmount) {
        await this.paidAmountInput.fill(memberData.paidAmount.toString());
      }
    }
  }

  async saveMember() {
    await this.saveMemberButton.click();
    // Wait for either success or modal to close
    await Promise.race([
      this.memberModal.waitFor({ state: 'hidden' }),
      this.page.waitForSelector('text=Member added successfully', { state: 'visible' })
    ]);
  }

  async cancelMemberCreation() {
    await this.cancelButton.click();
    await this.memberModal.waitFor({ state: 'hidden' });
  }

  // Assertions
  async assertMembersPageVisible() {
    await expect(this.page).toHaveTitle(/Members/);
    await expect(this.addMemberButton).toBeVisible();
  }

  async assertMemberModalVisible() {
    await expect(this.memberModal).toBeVisible();
    await expect(this.firstNameInput).toBeVisible();
    await expect(this.mobileInput).toBeVisible();
    await expect(this.joinDateInput).toBeVisible();
    await expect(this.dueDateInput).toBeVisible();
    await expect(this.amountInput).toBeVisible();
  }

  async assertMemberModalHidden() {
    await expect(this.memberModal).toBeHidden();
  }

  async assertMemberInList(memberName: string) {
    const memberElement = this.page.locator(`text=${memberName}`);
    await expect(memberElement).toBeVisible();
  }

  async assertMemberNotInList(memberName: string) {
    const memberElement = this.page.locator(`text=${memberName}`);
    await expect(memberElement).toBeHidden();
  }

  async assertValidationMessage(field: string, message: string) {
    const fieldLocator = this.page.locator(`input[formcontrolname="${field}"]`);
    const validationMessage = fieldLocator.locator('..').locator('p.text-red-600');
    await expect(validationMessage).toContainText(message);
  }

  async assertSuccessMessage(message: string) {
    await expect(this.page.locator(`text=${message}`)).toBeVisible();
  }

  // Search and filter
  async searchMembers(searchTerm: string) {
    await this.page.fill('input[placeholder="Search members..."]', searchTerm);
    await this.page.waitForTimeout(500); // Wait for search to complete
  }

  async filterByStatus(status: 'all' | 'active' | 'inactive') {
    await this.page.selectOption('select:has-text("Member Status")', status);
    await this.page.waitForTimeout(500); // Wait for filter to apply
  }

  async filterByPayment(paymentFilter: string) {
    await this.page.selectOption('select:has-text("Payment")', paymentFilter);
    await this.page.waitForTimeout(500); // Wait for filter to apply
  }

  // Member actions from list
  async editMember(memberName: string) {
    const memberRow = this.page.locator(`text=${memberName}`).locator('..').locator('..');
    await memberRow.locator('button:has-text("Edit")').click();
  }

  async viewMemberDetails(memberName: string) {
    const memberElement = this.page.locator(`text=${memberName}`);
    await memberElement.click();
  }

  // PG specific seat picker
  async openBedPicker() {
    await this.page.click('button:has-text("You can assign bed from here as well")');
    await this.page.waitForSelector('[role="dialog"]:has-text("Select Bed")', { state: 'visible' });
  }

  async selectBedFromPicker(floor: string, room: string, bed: string) {
    await this.page.click(`[data-floor="${floor}"]`);
    await this.page.waitForTimeout(500);
    await this.page.click(`[data-room="${room}"]`);
    await this.page.waitForTimeout(500);
    await this.page.click(`[data-bed="${bed}"]`);
    await this.page.click('button:has-text("Confirm Selection")');
  }

  // Helper methods
  async waitForMembersToLoad() {
    await this.page.waitForSelector('[id^="member-"]', { state: 'visible' });
  }

  async getMemberCount() {
    return await this.membersList.count();
  }

  async isMemberPresent(memberName: string): Promise<boolean> {
    const memberElement = this.page.locator(`text=${memberName}`);
    return await memberElement.isVisible();
  }

  async getMemberDetails(memberName: string) {
    const memberRow = this.page.locator(`text=${memberName}`).locator('..').locator('..');
    return {
      name: await memberRow.locator('td:first-child').textContent(),
      mobile: await memberRow.locator('td:nth-child(2)').textContent(),
      plan: await memberRow.locator('td:nth-child(3)').textContent(),
      status: await memberRow.locator('td:nth-child(7)').textContent()
    };
  }
}
