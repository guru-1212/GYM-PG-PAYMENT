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
  readonly showEditPermissionsModal = signal(false);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly busyWorkerId = signal<string | null>(null);

  // Form fields
  readonly workerName = signal('');
  readonly workerEmail = signal('');
  readonly workerPassword = signal('');
  readonly workerPermissions = signal<WorkerPermissions>({});
  readonly editingWorkerId = signal<string | null>(null);
  readonly editingWorkerName = signal('');
  readonly editWorkerPermissions = signal<WorkerPermissions>({});

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
        key: 'dashboard_view_basic',
        label: 'Dashboard Access',
        description: 'Can open dashboard page',
        feature: 'monthly_view',
        enabled: !!features.monthly_view,
      },
      {
        key: 'dashboard_view_member_count',
        label: 'Dashboard Member Count',
        description: 'Can view total members on dashboard',
        feature: 'monthly_view',
        enabled: !!features.monthly_view,
      },
      {
        key: 'dashboard_view_earnings',
        label: 'Dashboard Earnings',
        description: 'Can view dashboard earnings cards',
        feature: 'monthly_view',
        enabled: !!features.monthly_view,
      },
      {
        key: 'members_view_list',
        label: 'View Members',
        description: 'Can view member list',
        feature: 'monthly_view',
        enabled: !!features.monthly_view,
      },
      {
        key: 'members_add',
        label: 'Add Members',
        description: 'Can create new members',
        feature: 'worker_management',
        enabled: !!features.worker_management,
      },
      {
        key: 'members_edit',
        label: 'Edit Members',
        description: 'Can edit member details',
        feature: 'worker_management',
        enabled: !!features.worker_management,
      },
      {
        key: 'members_activate_deactivate',
        label: 'Activate/Deactivate Members',
        description: 'Can change active or inactive status',
        feature: 'worker_management',
        enabled: !!features.worker_management,
      },
      {
        key: 'members_delete',
        label: 'Delete Members',
        description: 'Can remove members permanently',
        feature: 'worker_management',
        enabled: !!features.worker_management,
      },
      {
        key: 'members_view_history',
        label: 'Member History',
        description: 'Can open member history and payment history',
        feature: 'monthly_view',
        enabled: !!features.monthly_view,
      },
      {
        key: 'payments_view',
        label: 'View Payments',
        description: 'Can view payment history',
        feature: 'payment_edit',
        enabled: !!features.payment_edit,
      },
      {
        key: 'payments_collect',
        label: 'Collect Payments',
        description: 'Can process and collect payments',
        feature: 'payment_edit',
        enabled: !!features.payment_edit,
      },
      {
        key: 'payments_export_pdf',
        label: 'Export Payments PDF',
        description: 'Can download payments PDF reports',
        feature: 'payment_edit',
        enabled: !!features.payment_edit,
      },
      {
        key: 'monthly_earnings_view',
        label: 'Monthly Earnings',
        description: 'Can view monthly earnings report',
        feature: 'monthly_view',
        enabled: !!features.monthly_view,
      },
      {
        key: 'rooms_view',
        label: 'View Rooms',
        description: 'Can view room information',
        feature: 'worker_management',
        enabled: !!features.worker_management,
      },
      {
        key: 'rooms_edit_layout',
        label: 'Edit Room Layout',
        description: 'Can change room/floor/bed layout',
        feature: 'worker_management',
        enabled: !!features.worker_management,
      },
      {
        key: 'workers_view',
        label: 'View Workers',
        description: 'Can open workers page',
        feature: 'worker_management',
        enabled: !!features.worker_management,
      },
      {
        key: 'workers_manage',
        label: 'Manage Workers',
        description: 'Can create/update/deactivate workers',
        feature: 'worker_management',
        enabled: !!features.worker_management,
      },
      {
        key: 'reports_download',
        label: 'Download Reports',
        description: 'Can download summary reports',
        feature: 'monthly_view',
        enabled: !!features.monthly_view,
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

  openEditPermissionsModal(worker: Worker): void {
    this.editingWorkerId.set(worker.workerId);
    this.editingWorkerName.set(worker.name);
    this.editWorkerPermissions.set(this.normalizePermissions(worker.permissions || {}));
    this.showEditPermissionsModal.set(true);
  }

  closeEditPermissionsModal(): void {
    this.showEditPermissionsModal.set(false);
    this.editingWorkerId.set(null);
    this.editingWorkerName.set('');
    this.editWorkerPermissions.set({});
  }

  togglePermission(key: keyof WorkerPermissions): void {
    const current = this.workerPermissions();
    this.workerPermissions.set({
      ...current,
      [key]: !current[key],
    });
  }

  toggleEditPermission(key: keyof WorkerPermissions): void {
    const current = this.editWorkerPermissions();
    this.editWorkerPermissions.set({
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
        this.permissionsWithLegacyAliases(this.workerPermissions()),
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

  async saveWorkerPermissions(): Promise<void> {
    const workerId = this.editingWorkerId();
    if (!workerId) {
      this.toast.error('Worker not selected');
      return;
    }

    this.submitting.set(true);
    this.busyWorkerId.set(workerId);
    try {
      await this.workerService.updateWorkerPermissions(
        workerId,
        this.permissionsWithLegacyAliases(this.editWorkerPermissions()),
        this.ownerFeatures(),
      );
      this.toast.success('Worker permissions updated');
      this.closeEditPermissionsModal();
    } catch (error: any) {
      this.toast.error(error?.message || 'Failed to update worker permissions');
    } finally {
      this.submitting.set(false);
      this.busyWorkerId.set(null);
    }
  }

  canCreateMoreWorkers(): boolean {
    return this.workers().filter((w) => w.status === 'active').length < 2;
  }

  permissionCount(permissions: WorkerPermissions | undefined): number {
    if (!permissions) return 0;
    const normalized = this.normalizePermissions(permissions);
    return this.availablePermissions().filter((p) => normalized[p.key]).length;
  }

  permissionTags(permissions: WorkerPermissions | undefined): string[] {
    if (!permissions) return [];
    const normalized = this.normalizePermissions(permissions);
    return this.availablePermissions()
      .filter((p) => normalized[p.key])
      .slice(0, 4)
      .map((p) => p.label);
  }

  private normalizePermissions(input: WorkerPermissions): WorkerPermissions {
    return {
      ...input,
      members_view_list: input.members_view_list || input.view_members || false,
      payments_view: input.payments_view || input.view_payments || false,
      rooms_view: input.rooms_view || input.view_rooms || false,
      monthly_earnings_view: input.monthly_earnings_view || input.view_monthly_earnings || false,
      dashboard_view_earnings: input.dashboard_view_earnings || input.view_dashboard_earnings || false,
      members_add: input.members_add || input.add_member || false,
      payments_collect: input.payments_collect || input.collect_payment || false,
    };
  }

  private permissionsWithLegacyAliases(input: WorkerPermissions): WorkerPermissions {
    const normalized = this.normalizePermissions(input);
    return {
      ...normalized,
      view_members: normalized.members_view_list || false,
      view_payments: normalized.payments_view || false,
      view_rooms: normalized.rooms_view || false,
      view_monthly_earnings: normalized.monthly_earnings_view || false,
      view_dashboard_earnings: normalized.dashboard_view_earnings || false,
      add_member: normalized.members_add || false,
      collect_payment: normalized.payments_collect || false,
    };
  }

  getPermissionDescription(permission: keyof WorkerPermissions): string {
    const p = this.availablePermissions().find((x) => x.key === permission);
    return p?.description || '';
  }
}
