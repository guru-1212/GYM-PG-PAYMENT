import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-owner-control',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './owner-control.component.html',
  styleUrl: './owner-control.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerControlComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private unsubscribe: (() => void) | null = null;

  features = [
    { key: 'monthly_view', label: 'Monthly View' },
    { key: 'whatsapp_automation', label: 'WhatsApp' },
    { key: 'worker_management', label: 'Workers' },
    { key: 'payment_edit', label: 'Payment Edit' }
  ];
  
  owners: any[] = [];
  loading = true;
  updatingMap: Record<string, boolean> = {};

  ngOnInit() {
    // Load sample owners data
    this.loadOwners();
  }

  private loadOwners() {
    try {
      // Attempt to load from Firestore
      const firestore = (window as any).firestore;
      if (firestore && typeof firestore !== 'undefined') {
        this.loadFromFirestore(firestore);
      } else {
        this.loadSampleData();
      }
    } catch (err) {
      console.warn('Firebase not initialized, using sample data:', err);
      this.loadSampleData();
    }
  }

  private loadFromFirestore(firestore: any) {
    try {
      const { collection, onSnapshot } = require('firebase/firestore');
      const ref = collection(firestore, 'owners');

      this.unsubscribe = onSnapshot(ref, (snapshot: any) => {
        this.owners = snapshot.docs.map((doc: any) => ({
          ownerId: doc.id,
          ...doc.data()
        }));
        this.loading = false;
        this.cdr.markForCheck();
      });
    } catch (err) {
      console.warn('Failed to load from Firestore:', err);
      this.loadSampleData();
    }
  }

  private loadSampleData() {
    // Sample data - replace once Firebase is properly configured
    this.owners = [
      {
        ownerId: 'owner1',
        name: 'John Doe',
        features: {
          monthly_view: true,
          whatsapp_automation: false,
          worker_management: true,
          payment_edit: false
        }
      },
      {
        ownerId: 'owner2',
        name: 'Jane Smith',
        features: {
          monthly_view: true,
          whatsapp_automation: true,
          worker_management: false,
          payment_edit: true
        }
      }
    ];
    this.loading = false;
    this.cdr.markForCheck();
  }

  async toggleFeature(ownerId: string, feature: string, value: boolean) {
    const key = `${ownerId}_${feature}`;
    this.updatingMap[key] = true;

    try {
      // Update local state first for instant UI feedback
      const owner = this.owners.find(o => o.ownerId === ownerId);
      if (owner) {
        if (!owner.features) owner.features = {};
        owner.features[feature] = value;
        this.cdr.markForCheck();
      }

      // Try to update in Firestore if available
      const firestore = (window as any).firestore;
      if (firestore) {
        const { doc, updateDoc } = require('firebase/firestore');
        const ref = doc(firestore, `owners/${ownerId}`);
        await updateDoc(ref, {
          [`features.${feature}`]: value
        });
      }
    } catch (err) {
      console.error('Error toggling feature:', err);
    } finally {
      this.updatingMap[key] = false;
    }
  }

  ngOnDestroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}
