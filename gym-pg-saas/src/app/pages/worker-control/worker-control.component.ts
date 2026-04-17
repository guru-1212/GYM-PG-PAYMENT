import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Worker, WorkerPermissions } from '../../core/models/worker.model';
import { OwnerFeatures } from '../../core/models/feture.model';
import { WorkerService } from '../../core/services/worker.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PermissionService } from '../../core/services/permission.service';
import { ModalComponent } from '../../shared/modal.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-worker-control',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, TranslatePipe],
  templateUrl: './worker-control.component.html',
  styleUrl: './worker-control.component.scss',
})
export class WorkerControlComponent implements OnInit, OnDestroy {
  private readonly workerService = inject(WorkerService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly permission = inject(PermissionService);

  readonly workers = signal<Worker[]>([]);
  readonly showAddWorkerModal = signal(false);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly busyWorkerId = signal<string | null>(null);

  // Form fields
  readonly workerName = signal('');
  readonly workerEmail = signal('');
  readonly workerPassword = signal('');
  readonly workerPermissions = signal<WorkerPermissions>({});

  readonly canManageWorkers = computed(() => this.permission.hasAccess('worker_management'));
  readonly ownerFeatures = computed(() => this.auth.profile()?.features || {});
  readonly availablePermissions = computed(() => this.getAvailablePermissions());

  private unsubscribe: (() => void) | null = null;

  ngOnInit(): void {
    this.loadWorkers();
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
  }

  private loadWorkers(): void {
    const ownerId = this.auth.profile()?.ownerId;
    if (!ownerId) {
      this.toast.error('Owner not found');
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);
    this.unsubscribe = this.workerService.watchWorkersByOwner(
      ownerId,
      (workers) => {
        this.workers.set(workers);
        this.loading.set(false);
        this.loadError.set(null);
      },
      (error) => {
        this.loading.set(false);
        console.error('Failed to load workers:', error);
        
        // Determine user-friendly error message
        const code = error?.code;
        let errorMsg = 'Failed to load workers';
        
        if (code === 'permission-denied') {
          errorMsg = 'Permission denied. Check Firestore rules for workers collection.';
        } else if (code === 'failed-precondition') {
          errorMsg = 'Firestore index missing. Click "Retry" to try again.';
        }
        
        this.loadError.set(errorMsg);
        this.toast.error(errorMsg);
      }
    );
  }

  retryLoadWorkers(): void {
    this.loadError.set(null);
    this.loadWorkers();
  }

  private getAvailablePermissions(): Array<{
    key: keyof WorkerPermissions;
    label: string;
    description: string;
    feature: keyof OwnerFeatures | null;
    enabled: boolean;
  }> {
    const features = this.ownerFeatures();

    return [
      {
        key: 'view_members',
        label: 'View Members',
        description: 'Can view member list',
        feature: 'monthly_view',
        enabled: !!features.monthly_view,
      },
      {
        key: 'view_payments',
        label: 'View Payments',
        description: 'Can view payment history',
        feature: 'payment_edit',
        enabled: !!features.payment_edit,
      },
      {
        key: 'view_rooms',
        label: 'View Rooms',
        description: 'Can view room information',
        feature: 'worker_management',
        enabled: !!features.worker_management,
      },
      {
        key: 'view_monthly_earnings',
        label: 'View Monthly Earnings',
        description: 'Can view monthly earnings report',
        feature: 'monthly_view',
        enabled: !!features.monthly_view,
      },
      {
        key: 'view_dashboard_earnings',
        label: 'View Dashboard Earnings',
        description: 'Can view earnings dashboard',
        feature: 'monthly_view',
        enabled: !!features.monthly_view,
      },
      {
        key: 'add_member',
        label: 'Add Members',
        description: 'Can create new members',
        feature: 'worker_management',
        enabled: !!features.worker_management,
      },
      {
        key: 'collect_payment',
        label: 'Collect Payments',
        description: 'Can process payments',
        feature: 'payment_edit',
        enabled: !!features.payment_edit,
      },
    ];
  }

  openAddWorkerModal(): void {
    this.workerName.set('');
    this.workerEmail.set('');
    this.workerPassword.set('');
    this.workerPermissions.set({});
    this.showAddWorkerModal.set(true);
  }

  closeAddWorkerModal(): void {
    this.showAddWorkerModal.set(false);
  }

  togglePermission(key: keyof WorkerPermissions): void {
    const current = this.workerPermissions();
    this.workerPermissions.set({
      ...current,
      [key]: !current[key],
    });
  }

  async createWorker(): Promise<void> {
    const name = this.workerName().trim();
    const email = this.workerEmail().trim();
    const password = this.workerPassword().trim();

    if (!name || !email || !password) {
      this.toast.error('Please fill all fields');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      this.toast.error('Invalid email format');
      return;
    }

    if (password.length < 6) {
      this.toast.error('Password must be at least 6 characters');
      return;
    }

    const ownerId = this.auth.profile()?.ownerId;
    if (!ownerId) {
      this.toast.error('Owner not found');
      return;
    }

    this.submitting.set(true);
    try {
      await this.workerService.createWorker(
        ownerId,
        name,
        email,
        password,
        this.workerPermissions(),
        this.ownerFeatures()
      );
      this.toast.success('Worker created successfully');
      this.closeAddWorkerModal();
    } catch (error: any) {
      this.toast.error(error?.message || 'Failed to create worker');
    } finally {
      this.submitting.set(false);
    }
  }

  async deactivateWorker(worker: Worker): Promise<void> {
    if (!confirm('Deactivate this worker?')) return;

    this.busyWorkerId.set(worker.workerId);
    try {
      await this.workerService.deactivateWorker(worker.workerId);
      this.toast.success('Worker deactivated');
    } catch {
      this.toast.error('Failed to deactivate worker');
    } finally {
      this.busyWorkerId.set(null);
    }
  }

  async reactivateWorker(worker: Worker): Promise<void> {
    this.busyWorkerId.set(worker.workerId);
    try {
      await this.workerService.reactivateWorker(worker.workerId);
      this.toast.success('Worker reactivated');
    } catch {
      this.toast.error('Failed to reactivate worker');
    } finally {
      this.busyWorkerId.set(null);
    }
  }

  async deleteWorker(worker: Worker): Promise<void> {
    if (!confirm('Delete this worker? This action cannot be undone.')) return;

    this.busyWorkerId.set(worker.workerId);
    try {
      await this.workerService.deleteWorker(worker.workerId);
      this.toast.success('Worker deleted');
    } catch {
      this.toast.error('Failed to delete worker');
    } finally {
      this.busyWorkerId.set(null);
    }
  }

  canCreateMoreWorkers(): boolean {
    return this.workers().filter((w) => w.status === 'active').length < 2;
  }

  getPermissionDescription(permission: keyof WorkerPermissions): string {
    const p = this.availablePermissions().find((x) => x.key === permission);
    return p?.description || '';
  }
}
