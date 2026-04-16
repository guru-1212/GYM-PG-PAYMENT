import { Injectable, inject, signal, computed } from '@angular/core';
import { Member } from '../models/member.model';
import { Payment } from '../models/payment.model';
import { PgLayout } from '../models/pg-layout.model';
import { MemberService } from './member.service';
import { PaymentService } from './payment.service';
import { PgLayoutService } from './pg-layout.service';

/**
 * DATA CACHE SERVICE - Optimizes Firestore usage
 * 
 * Purpose:
 * - Single source of truth for members, payments, and layout data
 * - Prevents duplicate Firestore reads across components
 * - Caches data after first load
 * - Provides manual refresh capability
 * - Real-time listeners set up ONCE at app level
 * 
 * How it works:
 * 1. First call to loadMembers() → fetches from Firestore + sets up listener
 * 2. Subsequent calls → returns cached data immediately
 * 3. Listener auto-updates cached data when Firestore changes
 * 4. User can call refresh() to force re-fetch
 * 5. Unsubscribe automatically on service destroy
 */
@Injectable({ providedIn: 'root' })
export class DataCacheService {
  private readonly memberApi = inject(MemberService);
  private readonly paymentApi = inject(PaymentService);
  private readonly layoutApi = inject(PgLayoutService);

  // Cache signals
  private readonly _members = signal<Member[]>([]);
  private readonly _payments = signal<Payment[]>([]);
  private readonly _layout = signal<PgLayout | null>(null);
  private readonly _isLoading = signal<Record<string, boolean>>({
    members: false,
    payments: false,
    layout: false,
  });

  // Public readonly signals
  readonly members = this._members.asReadonly();
  readonly payments = this._payments.asReadonly();
  readonly layout = this._layout.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  // Computed getters
  readonly hasMembersLoaded = computed(() => this._members().length > 0);
  readonly hasPaymentsLoaded = computed(() => this._payments().length > 0);
  readonly hasLayoutLoaded = computed(() => this._layout() !== null);

  // Listeners and state
  private currentOwnerId: string | null = null;
  private memberUnsub: (() => void) | null = null;
  private paymentUnsub: (() => void) | null = null;
  private layoutUnsub: (() => void) | null = null;

  /**
   * Load members data with caching
   * - First call: Fetches from Firestore + sets up real-time listener
   * - Subsequent calls: Returns cached data immediately
   * - Listener auto-updates cache when Firestore changes
   */
  async loadMembers(ownerId: string): Promise<Member[]> {
    // If already loaded for this owner, return cached data
    if (this.currentOwnerId === ownerId && this.hasMembersLoaded()) {
      return this._members();
    }

    // Prevent duplicate loads
    if (this._isLoading()['members']) {
      return new Promise((resolve) => {
        const timer = setInterval(() => {
          if (!this._isLoading()['members']) {
            clearInterval(timer);
            resolve(this._members());
          }
        }, 100);
      });
    }

    this.setLoading('members', true);
    this.currentOwnerId = ownerId;

    // Cleanup old listener
    this.memberUnsub?.();

    try {
      // Set up real-time listener
      this.memberUnsub = this.memberApi.watchMembersForOwner(ownerId, (list) => {
        this._members.set(list);
        this.setLoading('members', false);
      });

      return this._members();
    } catch (error) {
      console.error('❌ Error loading members:', error);
      this.setLoading('members', false);
      throw error;
    }
  }

  /**
   * Load payments data with caching
   * - First call: Fetches from Firestore + sets up real-time listener
   * - Subsequent calls: Returns cached data immediately
   */
  async loadPayments(ownerId: string): Promise<Payment[]> {
    // If already loaded for this owner, return cached data
    if (this.currentOwnerId === ownerId && this.hasPaymentsLoaded()) {
      return this._payments();
    }

    // Prevent duplicate loads
    if (this._isLoading()['payments']) {
      return new Promise((resolve) => {
        const timer = setInterval(() => {
          if (!this._isLoading()['payments']) {
            clearInterval(timer);
            resolve(this._payments());
          }
        }, 100);
      });
    }

    this.setLoading('payments', true);
    this.currentOwnerId = ownerId;

    // Cleanup old listener
    this.paymentUnsub?.();

    try {
      // Set up real-time listener
      this.paymentUnsub = this.paymentApi.watchPaymentsForOwner(ownerId, (list) => {
        this._payments.set(list);
        this.setLoading('payments', false);
      });

      return this._payments();
    } catch (error) {
      console.error('❌ Error loading payments:', error);
      this.setLoading('payments', false);
      throw error;
    }
  }

  /**
   * Load layout data with caching
   */
  async loadLayout(ownerId: string): Promise<PgLayout | null> {
    // If already loaded for this owner, return cached data
    if (this.currentOwnerId === ownerId && this.hasLayoutLoaded()) {
      return this._layout();
    }

    // Prevent duplicate loads
    if (this._isLoading()['layout']) {
      return new Promise((resolve) => {
        const timer = setInterval(() => {
          if (!this._isLoading()['layout']) {
            clearInterval(timer);
            resolve(this._layout());
          }
        }, 100);
      });
    }

    this.setLoading('layout', true);
    this.currentOwnerId = ownerId;

    // Cleanup old listener
    this.layoutUnsub?.();

    try {
      // Set up real-time listener
      this.layoutUnsub = this.layoutApi.watchLayout(ownerId, (layout) => {
        this._layout.set(layout);
        this.setLoading('layout', false);
      });

      return this._layout();
    } catch (error) {
      console.error('❌ Error loading layout:', error);
      this.setLoading('layout', false);
      throw error;
    }
  }

  /**
   * Load ALL data at once (members + payments + layout)
   * Used by dashboard to fetch everything together
   */
  async loadAllData(ownerId: string): Promise<void> {
    try {
      await Promise.all([
        this.loadMembers(ownerId),
        this.loadPayments(ownerId),
        this.loadLayout(ownerId),
      ]);
    } catch (error) {
      console.error('❌ Error loading all data:', error);
      throw error;
    }
  }

  /**
   * Manual refresh - force re-fetch all data from Firestore
   * Used when user clicks "Refresh Data" button
   */
  async refresh(ownerId: string): Promise<void> {
    // Clear cached data
    this._members.set([]);
    this._payments.set([]);
    this._layout.set(null);

    // Clear owner ID to force reload
    this.currentOwnerId = null;

    // Reload all data
    await this.loadAllData(ownerId);
  }

  /**
   * Clear all cached data and listeners
   * Used on logout or when switching accounts
   */
  clear(): void {
    this._members.set([]);
    this._payments.set([]);
    this._layout.set(null);
    this.currentOwnerId = null;
    this.memberUnsub?.();
    this.paymentUnsub?.();
    this.layoutUnsub?.();
    this.memberUnsub = null;
    this.paymentUnsub = null;
    this.layoutUnsub = null;
  }

  private setLoading(key: string, value: boolean): void {
    this._isLoading.update((state) => ({
      ...state,
      [key]: value,
    }));
  }
}
