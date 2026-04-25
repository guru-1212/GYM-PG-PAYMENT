# Firebase Cloud Messaging Setup Guide

## Overview
Your gym management app now supports system-level push notifications for owners and admins, working like WhatsApp notifications even when the app is closed.

## What's Implemented
- ✅ System-level push notifications for owner/admin only
- ✅ Background notifications when app is closed
- ✅ Real-time notifications for member approval requests
- ✅ Payment due alerts and reminders
- ✅ Payment received confirmations
- ✅ Click-to-navigate functionality
- ✅ Service worker for background handling

## Setup Instructions

### 1. Firebase Console Setup
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: `test-gym-pg-sass`
3. Navigate to **Project Settings** > **Cloud Messaging**
4. Copy the **Server key** and **Sender ID**
5. Navigate to **Project Settings** > **General**
6. Under **Your apps**, find your web app
7. Copy the **Web Push Certificate Key (VAPID Key)**

### 2. Update VAPID Key
Replace the placeholder VAPID key in `src/app/core/services/notification.service.ts`:

```typescript
// Line ~91
vapidKey: 'YOUR_ACTUAL_VAPID_KEY_HERE' // Replace with your actual VAPID key
```

### 3. Deploy Cloud Functions
1. Install Firebase CLI if not already installed:
```bash
npm install -g firebase-tools
```

2. Login to Firebase:
```bash
firebase login
```

3. Initialize functions in your project:
```bash
firebase init functions
```

4. Install dependencies:
```bash
cd functions
npm install firebase-admin firebase-functions
```

5. Deploy functions:
```bash
firebase deploy --only functions
```

### 4. Update Firebase Configuration
Update the Firebase configuration in `firebase-messaging-sw.js` to match your production settings:

```javascript
firebase.initializeApp({
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
});
```

### 5. Test the Setup
1. Build and deploy your app:
```bash
ng build
firebase deploy
```

2. Open the app as an owner/admin
3. Grant notification permissions when prompted
4. Test scenarios:
   - Add a new member (should trigger approval notification)
   - Create a payment (should trigger payment received notification)
   - Wait for daily due check (should trigger due notifications)

## Notification Types

### Member Approval Requests
- **Trigger**: New member created with 'pending' status
- **Title**: "👤 New Member Approval Request"
- **Action**: Click to navigate to members page with pending filter

### Payment Due Alerts
- **Trigger**: Daily check for overdue dues (runs every 24 hours)
- **Title**: "💳 Payment Due Alert"
- **Action**: Click to navigate to specific member

### Payment Received
- **Trigger**: New payment entry created
- **Title**: "💰 Payment Received"
- **Action**: Click to navigate to payments page

## Features

### System-Level Notifications
- Works even when app is closed
- Shows in notification center like WhatsApp
- Requires user permission (automatically requested for admin/owner)

### Background Sync
- Service worker handles background messages
- Automatic token refresh every hour
- Cleanup on logout

### Smart Navigation
- Click notifications to open relevant app sections
- Different actions based on notification type
- Focus existing app window if open

## Troubleshooting

### Notifications Not Working
1. Check browser notification permissions
2. Verify Firebase configuration
3. Check console for FCM token errors
4. Ensure Cloud Functions are deployed

### Service Worker Issues
1. Clear browser cache
2. Re-register service worker
3. Check for JavaScript errors in service worker

### Firebase Functions Not Triggering
1. Verify function deployment
2. Check Firebase logs for errors
3. Ensure Firestore security rules allow access

## Security Notes
- Only admin/owner users receive notifications
- FCM tokens are stored securely in Firestore
- Service worker validates notification types
- Automatic cleanup on logout

## Next Steps
- Add WhatsApp Business API integration for member reminders
- Implement notification preferences
- Add batch notification scheduling
- Create notification analytics dashboard
