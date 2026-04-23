import { Component } from '@angular/core';
import { NotificationService } from '../services/notification.service';

@Component({
  selector: 'app-notification-test',
  template: `
    <div class="p-4 bg-blue-50 rounded-lg mb-4">
      <h3 class="text-lg font-bold mb-2">Notification Test</h3>
      <button (click)="testNotification()" 
              class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 mr-2">
        Test Browser Notification
      </button>
      <button (click)="testApprovalNotification()" 
              class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 mr-2">
        Test Approval Notification
      </button>
      <button (click)="testDueNotification()" 
              class="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600">
        Test Due Notification
      </button>
    </div>
  `
})
export class NotificationTestComponent {
  constructor(private notificationService: NotificationService) {}

  testNotification() {
    // console.log('Testing basic notification...');
    this.notificationService.showNotification(
      'Test Notification',
      'This is a test notification from the gym app'
    );
  }

  testApprovalNotification() {
    // console.log('Testing approval notification...');
    this.notificationService.triggerApprovalRequest('Test Member', 'test-member-123');
  }

  testDueNotification() {
    // console.log('Testing due notification...');
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);
    this.notificationService.triggerDueReminder('Test Member', dueDate, 'test-member-123');
  }
}
