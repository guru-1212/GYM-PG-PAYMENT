import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Owner } from '../../core/models/owner.model';
import { AdminService } from '../../core/services/admin.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-admin-owners',
  standalone: true,
  templateUrl: './admin-owners.component.html',
})
export class AdminOwnersComponent implements OnInit, OnDestroy {
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);

  readonly owners = signal<Owner[]>([]);
  readonly busyId = signal<string | null>(null);
  private unsub: (() => void) | null = null;

  ngOnInit(): void {
    this.unsub = this.admin.watchAllOwners((list) => this.owners.set(list));
  }

  ngOnDestroy(): void {
    this.unsub?.();
  }

  ownerRows(): Owner[] {
    return this.owners().filter((o) => o.role === 'owner');
  }

  async approve(o: Owner): Promise<void> {
    this.busyId.set(o.ownerId);
    try {
      await this.admin.approveOwner(o.ownerId);
      this.toast.success('Owner approved');
    } catch {
      this.toast.error('Could not approve');
    } finally {
      this.busyId.set(null);
    }
  }

  async reject(o: Owner): Promise<void> {
    this.busyId.set(o.ownerId);
    try {
      await this.admin.rejectOwner(o.ownerId);
      this.toast.success('Owner rejected');
    } catch {
      this.toast.error('Could not reject');
    } finally {
      this.busyId.set(null);
    }
  }
}
