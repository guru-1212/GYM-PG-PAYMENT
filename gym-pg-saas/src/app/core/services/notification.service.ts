import { Injectable, inject, effect } from '@angular/core';
import { Member } from '../models/member.model';
import { calendarDaysBetween, startOfDay, startOfToday, timestampToDate } from '../utils/date.utils';
import { AuthService } from './auth.service';
import { FirebaseAppService } from './firebase-app.service';
import { getMessaging, getToken, onMessage, deleteToken } from 'firebase/messaging';
import {
  collection,
  collectionGroup,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';

export interface NotificationData {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, any>;
  requireInteraction?: boolean;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly permissionAskedKey = 'notify.permission.asked.v1';
  private readonly shownPrefix = 'notify.shown.v1';
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FirebaseAppService);
  private messaging = getMessaging(this.fb.app);
  private fcmToken: string | null = null;
  private tokenRefreshInterval: any = null;
  private messageUnsubscribe: (() => void) | null = null;
  private roleListenerUnsubscribes: Array<() => void> = [];
  private shownDocIds = new Set<string>();

  constructor() {
    // Initialize notifications for admin/owner only
    effect(() => {
      const user = this.auth.user();
      if (user && (this.auth.isAdmin() || this.auth.isApprovedOwner() || this.auth.isSupervisor())) {
        this.initializeNotifications();
      } else {
        this.cleanupPushNotifications();
      }
    });
  }

  requestPermissionOnce(): void {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted' || Notification.permission === 'denied') return;
    if (localStorage.getItem(this.permissionAskedKey) === '1') return;
    localStorage.setItem(this.permissionAskedKey, '1');
    void Notification.requestPermission();
  }

  private async initializeNotifications(): Promise<void> {
    try {
      // Request notification permission first
      await this.requestNotificationPermission();
      
      // Get FCM token for push notifications
      await this.getFCMToken();
      
      // Setup message listeners
      this.setupMessageListener();
      
      // Setup role-specific foreground listeners
      this.setupRoleEventListeners();
      
      // Setup token refresh
      this.setupTokenRefresh();
      
      // console.log('Push notifications initialized for admin/owner');
    } catch (error) {
      console.error('Failed to initialize notifications:', error);
    }
  }

  private async requestNotificationPermission(): Promise<NotificationPermission> {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        // console.log('Notification permission granted');
      }
      return permission;
    }
    return 'denied';
  }

  private async getFCMToken(): Promise<void> {
    try {
      // Check if service worker is registered
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        // console.log('Service Worker registered for messaging:', registration);
      }

      const token = await getToken(this.messaging, {
        vapidKey: 'BFkkFZ9oqkFC3vc9xySqcLMyftK6nXePgeBj0tXAMqPcJ2-3dv07aYsCuaqwwREKKNtZbyaDIXNbxDC9EMKQwhk'
      });

      if (token && token !== this.fcmToken) {
        this.fcmToken = token;
        await this.saveTokenToFirestore(token);
        // console.log('FCM Token obtained:', token);
      }
    } catch (error) {
      console.error('Failed to get FCM token:', error);
    }
  }

  private async saveTokenToFirestore(token: string): Promise<void> {
    const user = this.auth.user();
    if (!user) return;

    try {
      const tokenDoc = doc(this.fb.db, 'fcmTokens', user.uid);
      await setDoc(tokenDoc, {
        token,
        uid: user.uid,
        role: this.auth.isAdmin() ? 'admin' : 'owner',
        createdAt: new Date(),
        lastUsed: new Date(),
        deviceInfo: this.getDeviceInfo()
      }, { merge: true });
    } catch (error) {
      console.error('Failed to save FCM token:', error);
    }
  }

  private setupMessageListener(): void {
    this.messageUnsubscribe?.();
    this.messageUnsubscribe = onMessage(this.messaging, (payload) => {
      // console.log('Received push message:', payload);
      
      // Show system notification even when app is in foreground
      this.showSystemNotification({
        title: payload.notification?.title || 'New Notification',
        body: payload.notification?.body || '',
        icon: payload.notification?.icon || '/icons/icon-192.png',
        tag: (payload as any).tag,
        data: payload.data,
        requireInteraction: true
      });
    });
  }

  private setupTokenRefresh(): void {
    // Refresh token every hour
    this.tokenRefreshInterval = setInterval(() => {
      this.getFCMToken();
    }, 60 * 60 * 1000);
  }

  private getDeviceInfo(): Record<string, string> {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      timestamp: new Date().toISOString()
    };
  }

  private cleanupPushNotifications(): void {
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
      this.tokenRefreshInterval = null;
    }
    this.messageUnsubscribe?.();
    this.messageUnsubscribe = null;
    this.roleListenerUnsubscribes.forEach((fn) => fn());
    this.roleListenerUnsubscribes = [];
    this.shownDocIds.clear();

    // Remove FCM token on logout
    if (this.fcmToken) {
      deleteToken(this.messaging).then(() => {
        // console.log('FCM token deleted on logout');
      });
    }
  }

  private setupRoleEventListeners(): void {
    this.roleListenerUnsubscribes.forEach((fn) => fn());
    this.roleListenerUnsubscribes = [];
    const user = this.auth.user();
    if (!user) return;
    if (this.auth.isAdmin()) {
      this.setupAdminEventListeners(user.uid);
      return;
    }
    if (this.auth.isApprovedOwner() || this.auth.isSupervisor()) {
      const ownerId = this.auth.effectiveOwnerId();
      if (ownerId) this.setupOwnerEventListeners(ownerId);
    }
  }

  private setupAdminEventListeners(uid: string): void {
    // Listen for new member approval requests
    const approvalRef = doc(this.fb.db, 'adminNotifications', uid);
    this.roleListenerUnsubscribes.push(onSnapshot(approvalRef, (snapshot) => {
      const data = snapshot.data();
      if (data && data['pendingApprovals'] > 0) {
        this.showSystemNotification({
          title: '👤 New Member Approval Request',
          body: `${data['pendingApprovals']} member(s) waiting for your approval`,
          icon: '/icons/icon-192.png',
          tag: 'member-approval',
          data: { type: 'member-approval', count: data['pendingApprovals'] },
          requireInteraction: true
        });
      }
    }));

    // Listen for urgent payment dues
    const duesRef = doc(this.fb.db, 'urgentNotifications', uid);
    this.roleListenerUnsubscribes.push(onSnapshot(duesRef, (snapshot) => {
      const data = snapshot.data();
      if (data && data['urgentDues']?.length > 0) {
        const dues = data['urgentDues'] as any[];
        dues.forEach(due => {
          this.showSystemNotification({
            title: '💳 Payment Due Alert',
            body: `${due.memberName} - Due today (${new Date(due.dueDate).toLocaleDateString()})`,
            icon: '/icons/icon-192.png',
            tag: `due-${due.memberId}`,
            data: { type: 'payment-due', memberId: due.memberId },
            requireInteraction: true
          });
        });
      }
    }));

    // Foreground alert for owner->admin chat messages.
    const adminUnreadQ = query(
      collectionGroup(this.fb.db, 'messages'),
      where('senderRole', '==', 'owner'),
      where('readByAdmin', '==', false),
      orderBy('timestamp', 'desc'),
      limit(50),
    );
    this.roleListenerUnsubscribes.push(
      onSnapshot(adminUnreadQ, (snap) => {
        snap.docChanges().forEach((chg) => {
          if (chg.type !== 'added') return;
          const id = chg.doc.id;
          if (this.shownDocIds.has(id)) return;
          this.shownDocIds.add(id);
          const data = chg.doc.data() as Record<string, unknown>;
          const senderName = String(data['senderName'] || 'Owner').trim();
          const text = String(data['text'] || '').trim();
          this.showSystemNotification({
            title: 'New owner message',
            body: text ? `${senderName}: ${text}` : `${senderName} sent a message`,
            icon: '/icons/icon-192.png',
            tag: `chat-${id}`,
            data: { type: 'admin-chat' },
            requireInteraction: true,
          });
        });
      }),
    );
  }

  private setupOwnerEventListeners(ownerId: string): void {
    // Foreground alert for in-app notifications written under owners/{ownerId}/appNotifications.
    const ownerNotificationsQ = query(
      collection(this.fb.db, `owners/${ownerId}/appNotifications`),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    this.roleListenerUnsubscribes.push(
      onSnapshot(ownerNotificationsQ, (snap) => {
        snap.docChanges().forEach((chg) => {
          if (chg.type !== 'added') return;
          const id = chg.doc.id;
          if (this.shownDocIds.has(id)) return;
          this.shownDocIds.add(id);
          const data = chg.doc.data() as Record<string, unknown>;
          const title = String(data['title'] || 'New notification').trim();
          const body = String(data['body'] || '').trim();
          this.showSystemNotification({
            title,
            body,
            icon: '/icons/icon-192.png',
            tag: `owner-app-${id}`,
            data: { type: 'owner-in-app' },
            requireInteraction: false,
          });
        });
      }),
    );
  }

  private showSystemNotification(notificationData: NotificationData): void {
    // console.log('showSystemNotification called:', notificationData);
    // console.log('Notification.permission:', Notification.permission);
    // console.log('Notification supported:', typeof Notification !== 'undefined');
    
    if ('Notification' in window && Notification.permission === 'granted') {
      // console.log('Creating system notification...');
      const notification = new Notification(notificationData.title, {
        body: notificationData.body,
        icon: notificationData.icon || '/icons/icon-192.png',
        tag: notificationData.tag,
        data: notificationData.data,
        requireInteraction: notificationData.requireInteraction || false,
        badge: '/icons/icon-192.png',
        silent: false
      });
      // console.log('System notification created:', notification);

      // Handle notification click - navigate to relevant page
      notification.onclick = (event) => {
        event.preventDefault();
        window.focus();
        notification.close();
        
        // Navigate based on notification type
        if (notificationData.data && notificationData.data['type'] === 'member-approval') {
          window.location.href = '/members?filter=pending';
        } else if (notificationData.data && notificationData.data['type'] === 'payment-due') {
          window.location.href = `/members/${notificationData.data['memberId']}`;
        }
      };

      // Auto-close after 8 seconds if not important
      if (!notificationData.requireInteraction) {
        setTimeout(() => {
          notification.close();
        }, 8000);
      }
    } else {
      // console.log('showSystemNotification failed - permission not granted or not supported');
    }
  }

  checkDueMembers(members: Member[]): void {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    const today = startOfToday();
    const overdue: Member[] = [];
    const dueSoon: Member[] = [];

    for (const m of members) {
      if (m.status !== 'active') continue;
      const due = timestampToDate(m.dueDate);
      if (!due) continue;
      const daysLeft = calendarDaysBetween(today, startOfDay(due));
      if (daysLeft < 0) overdue.push(m);
      else if (daysLeft >= 1 && daysLeft <= 2) dueSoon.push(m);
    }

    if (overdue.length > 0) {
      this.showNotification(
        'Overdue Members',
        `${overdue.length} member(s) have overdue payment.`,
        this.buildDedupKey('overdue', overdue),
      );
    }

    if (dueSoon.length > 0) {
      this.showNotification(
        'Due Soon Members',
        `${dueSoon.length} member(s) due in 1-2 days.`,
        this.buildDedupKey('duesoon', dueSoon),
      );
    }
  }

  showNotification(title: string, body: string, dedupKey?: string): void {
    // console.log('showNotification called:', { title, body, dedupKey });
    // console.log('Notification.permission:', Notification.permission);
    // console.log('Notification supported:', typeof Notification !== 'undefined');
    
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      // console.log('Notification not supported');
      return;
    }
    if (Notification.permission !== 'granted') {
      // console.log('Permission not granted:', Notification.permission);
      return;
    }
    if (dedupKey && this.wasShown(dedupKey)) {
      // console.log('Dedup key already shown:', dedupKey);
      return;
    }

    // console.log('Creating notification...');
    const notification = new Notification(title, { body, icon: '/favicon.ico' });
    // console.log('Notification created:', notification);
    
    if (dedupKey) this.markShown(dedupKey);
  }

  // Public methods for manual notification triggering
  async triggerDueReminder(memberName: string, dueDate: Date, memberId: string): Promise<void> {
    try {
      // console.log('triggerDueReminder called:', { memberName, dueDate, memberId });
      this.showSystemNotification({
        title: 'Payment Due Soon',
        body: `${memberName} has payment due on ${dueDate.toLocaleDateString()}`,
        icon: '/icons/icon-192.png',
        tag: `due-${memberId}`,
        data: { type: 'payment-due', memberId },
        requireInteraction: true
      });
      // console.log('triggerDueReminder completed successfully');
    } catch (error) {
      console.error('Error in triggerDueReminder:', error);
    }
  }

  async triggerApprovalRequest(memberName: string, memberId: string): Promise<void> {
    try {
      // console.log('triggerApprovalRequest called:', { memberName, memberId });
      this.showSystemNotification({
        title: 'New Approval Request',
        body: `${memberName} is requesting approval`,
        icon: '/icons/icon-192.png',
        tag: `approval-${memberId}`,
        data: { type: 'member-approval', memberId },
        requireInteraction: true
      });
      // console.log('triggerApprovalRequest completed successfully');
    } catch (error) {
      console.error('Error in triggerApprovalRequest:', error);
    }
  }

  async triggerPaymentReceived(memberName: string, amount: number): Promise<void> {
    try {
      // console.log('triggerPaymentReceived called:', { memberName, amount });
      this.showSystemNotification({
        title: 'Payment Received',
        body: `${memberName} paid ${amount}`,
        icon: '/icons/icon-192.png',
        tag: 'payment-received',
        data: { type: 'payment-received' },
        requireInteraction: false
      });
      // console.log('triggerPaymentReceived completed successfully');
    } catch (error) {
      console.error('Error in triggerPaymentReceived:', error);
    }
  }

  private buildDedupKey(type: 'overdue' | 'duesoon', members: Member[]): string {
    const today = new Date().toISOString().slice(0, 10);
    const ids = members.map((m) => m.memberId).sort().join(',');
    return `${this.shownPrefix}:${today}:${type}:${ids}`;
  }

  private wasShown(key: string): boolean {
    return localStorage.getItem(key) === '1';
  }

  private markShown(key: string): void {
    localStorage.setItem(key, '1');
  }
}