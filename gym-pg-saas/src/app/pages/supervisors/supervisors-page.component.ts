import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Unsubscribe } from 'firebase/firestore';
import { DEFAULT_SUPERVISOR_QUOTA, Supervisor, SupervisorPermissions } from '../../core/models/supervisor.model';
import { AuthService } from '../../core/services/auth.service';
import { SupervisorService } from '../../core/services/supervisor.service';
import { ToastService } from '../../core/services/toast.service';
import { defaultSupervisorPermissions } from '../../core/utils/supervisor.util';
import { ModalComponent } from '../../shared/modal.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

interface PermissionRow {
  key: keyof SupervisorPermissions;
  labelKey: string;
}

const PERMISSION_ROWS: readonly PermissionRow[] = [
  { key: 'canViewMembers', labelKey: 'supervisors.perm.canViewMembers' },
  { key: 'canEditMembers', labelKey: 'supervisors.perm.canEditMembers' },
  { key: 'canViewPayments', labelKey: 'supervisors.perm.canViewPayments' },
  { key: 'canRecordPayments', labelKey: 'supervisors.perm.canRecordPayments' },
  { key: 'canViewRooms', labelKey: 'supervisors.perm.canViewRooms' },
  { key: 'canEditRooms', labelKey: 'supervisors.perm.canEditRooms' },
  { key: 'canViewInactiveMembers', labelKey: 'supervisors.perm.canViewInactiveMembers' },
  { key: 'canShareOnboardingLink', labelKey: 'supervisors.perm.canShareOnboardingLink' },
];

@Component({
  selector: 'app-supervisors-page',
  standalone: true,
  imports: [ReactiveFormsModule, ModalComponent, TranslatePipe],
  templateUrl: './supervisors-page.component.html',
})
export class SupervisorsPageComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly supervisors = inject(SupervisorService);
  private readonly toast = inject(ToastService);

  readonly rows = signal<Supervisor[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly quota = signal<number>(DEFAULT_SUPERVISOR_QUOTA);

  readonly createOpen = signal(false);
  readonly editing = signal<Supervisor | null>(null);
  readonly resetTarget = signal<Supervisor | null>(null);
  readonly deleteTarget = signal<Supervisor | null>(null);

  readonly permissionRows = PERMISSION_ROWS;
  readonly isPg = computed(() => this.auth.profile()?.businessType === 'pg');

  readonly atCap = computed(() => this.rows().length >= this.quota());
  readonly remaining = computed(() => Math.max(0, this.quota() - this.rows().length));

  /** Form for creating a new supervisor. */
  readonly createForm = this.fb.group({
    userId: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(32)]],
    name: ['', [Validators.required, Validators.maxLength(60)]],
    password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(64)]],
    canViewMembers: [true],
    canEditMembers: [false],
    canViewPayments: [true],
    canRecordPayments: [false],
    canViewRooms: [true],
    canEditRooms: [false],
    canViewInactiveMembers: [false],
    canShareOnboardingLink: [false],
  });

  /** Form for editing permissions / name on an existing supervisor. */
  readonly editForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(60)]],
    canViewMembers: [false],
    canEditMembers: [false],
    canViewPayments: [false],
    canRecordPayments: [false],
    canViewRooms: [false],
    canEditRooms: [false],
    canViewInactiveMembers: [false],
    canShareOnboardingLink: [false],
  });

  /** Form for resetting password (separate so the password field is isolated). */
  readonly resetForm = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(64)]],
  });

  private unsub: Unsubscribe | null = null;

  async ngOnInit(): Promise<void> {
    const ownerId = this.auth.profile()?.ownerId;
    if (!ownerId) return;
    this.quota.set(await this.supervisors.getQuota(ownerId));
    this.unsub = this.supervisors.watchSupervisors(ownerId, (rows) => {
      this.rows.set(rows);
      this.loading.set(false);
    });
  }

  ngOnDestroy(): void {
    this.unsub?.();
    this.unsub = null;
  }

  // --------------------------- create ---------------------------

  openCreate(): void {
    if (this.atCap()) {
      this.toast.error(`Supervisor cap reached (${this.quota()}). Ask admin to raise it.`);
      return;
    }
    this.createForm.reset({
      userId: '',
      name: '',
      password: '',
      ...defaultSupervisorPermissions(),
    });
    this.createOpen.set(true);
  }

  closeCreate(): void {
    this.createOpen.set(false);
  }

  async submitCreate(): Promise<void> {
    if (this.createForm.invalid || this.busy()) return;
    const v = this.createForm.value;
    const permissions: SupervisorPermissions = {
      canViewMembers: !!v.canViewMembers,
      canEditMembers: !!v.canEditMembers,
      canViewPayments: !!v.canViewPayments,
      canRecordPayments: !!v.canRecordPayments,
      canViewRooms: !!v.canViewRooms,
      canEditRooms: !!v.canEditRooms,
      canViewInactiveMembers: !!v.canViewInactiveMembers,
      canShareOnboardingLink: !!v.canShareOnboardingLink,
    };
    this.busy.set(true);
    try {
      await this.supervisors.createSupervisor({
        userId: String(v.userId || '').trim(),
        name: String(v.name || '').trim(),
        password: String(v.password || ''),
        permissions,
      });
      this.toast.success('Supervisor created');
      this.createOpen.set(false);
    } catch (e) {
      const msg = (e as { message?: string })?.message || 'Could not create supervisor';
      this.toast.error(msg);
    } finally {
      this.busy.set(false);
    }
  }

  // ---------------------------- edit ----------------------------

  openEdit(s: Supervisor): void {
    this.editing.set(s);
    this.editForm.reset({
      name: s.name,
      canViewMembers: s.permissions.canViewMembers,
      canEditMembers: s.permissions.canEditMembers,
      canViewPayments: s.permissions.canViewPayments,
      canRecordPayments: s.permissions.canRecordPayments,
      canViewRooms: s.permissions.canViewRooms,
      canEditRooms: s.permissions.canEditRooms,
      canViewInactiveMembers: s.permissions.canViewInactiveMembers,
      canShareOnboardingLink: s.permissions.canShareOnboardingLink,
    });
  }

  closeEdit(): void {
    this.editing.set(null);
  }

  async submitEdit(): Promise<void> {
    const target = this.editing();
    if (!target || this.editForm.invalid || this.busy()) return;
    const v = this.editForm.value;
    const permissions: SupervisorPermissions = {
      canViewMembers: !!v.canViewMembers,
      canEditMembers: !!v.canEditMembers,
      canViewPayments: !!v.canViewPayments,
      canRecordPayments: !!v.canRecordPayments,
      canViewRooms: !!v.canViewRooms,
      canEditRooms: !!v.canEditRooms,
      canViewInactiveMembers: !!v.canViewInactiveMembers,
      canShareOnboardingLink: !!v.canShareOnboardingLink,
    };
    this.busy.set(true);
    try {
      await this.supervisors.updateSupervisor(target.supervisorId, {
        name: String(v.name || '').trim(),
        permissions,
      });
      this.toast.success('Supervisor updated');
      this.editing.set(null);
    } catch {
      this.toast.error('Could not update supervisor');
    } finally {
      this.busy.set(false);
    }
  }

  // ------------------------- enable/disable -------------------------

  async toggleStatus(s: Supervisor): Promise<void> {
    const next = s.status === 'active' ? 'disabled' : 'active';
    this.busy.set(true);
    try {
      await this.supervisors.updateSupervisor(s.supervisorId, { status: next });
      this.toast.success(next === 'active' ? 'Supervisor enabled' : 'Supervisor disabled');
    } catch {
      this.toast.error('Could not update status');
    } finally {
      this.busy.set(false);
    }
  }

  // ---------------------------- delete ----------------------------

  openDelete(s: Supervisor): void {
    this.deleteTarget.set(s);
  }

  closeDelete(): void {
    this.deleteTarget.set(null);
  }

  async confirmDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target || this.busy()) return;
    this.busy.set(true);
    try {
      await this.supervisors.deleteSupervisor(target);
      this.toast.success('Supervisor removed');
      this.deleteTarget.set(null);
    } catch {
      this.toast.error('Could not remove supervisor');
    } finally {
      this.busy.set(false);
    }
  }

  // ------------------------- reset password -------------------------

  openReset(s: Supervisor): void {
    this.resetTarget.set(s);
    this.resetForm.reset({ password: '' });
  }

  closeReset(): void {
    this.resetTarget.set(null);
  }

  async submitReset(): Promise<void> {
    const target = this.resetTarget();
    if (!target || this.resetForm.invalid || this.busy()) return;
    this.busy.set(true);
    try {
      await this.supervisors.resetSupervisorPassword(
        target,
        String(this.resetForm.value.password || ''),
      );
      this.toast.success('Password reset');
      this.resetTarget.set(null);
    } catch (e) {
      const msg = (e as { message?: string })?.message || 'Could not reset password';
      this.toast.error(msg);
    } finally {
      this.busy.set(false);
    }
  }

  formatCreatedAt(s: Supervisor): string {
    const ts = s.createdAt as { toDate?: () => Date } | null | undefined;
    const d = ts?.toDate ? ts.toDate() : null;
    return d ? d.toLocaleDateString() : '';
  }
}
