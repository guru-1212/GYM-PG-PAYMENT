import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { AdminService } from '../../core/services/admin.service';
import { Owner } from '../../core/models/owner.model';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  templateUrl: './admin-dashboard.component.html',
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private readonly admin = inject(AdminService);

  readonly owners = signal<Owner[]>([]);
  private unsub: (() => void) | null = null;

  ngOnInit(): void {
    this.unsub = this.admin.watchAllOwners((list) => this.owners.set(list));
  }

  ngOnDestroy(): void {
    this.unsub?.();
  }

  stats(): { total: number; pending: number; approved: number } {
    return this.admin.stats(this.owners());
  }
}
