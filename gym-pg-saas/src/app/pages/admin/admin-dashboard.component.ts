import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminService } from '../../core/services/admin.service';
import { AdminAnalyticsService, AdminStats } from '../../core/services/admin-analytics.service';
import { Owner } from '../../core/models/owner.model';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './admin-dashboard.component.html',
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private readonly admin = inject(AdminService);
  private readonly analytics = inject(AdminAnalyticsService);

  readonly owners = signal<Owner[]>([]);
  readonly stats = signal<AdminStats | null>(null);
  readonly statsLoading = signal(true);
  private unsub: (() => void) | null = null;

  ngOnInit(): void {
    this.unsub = this.admin.watchAllOwners((list) => this.owners.set(list));
    this.loadStats();
  }

  ngOnDestroy(): void {
    this.unsub?.();
  }

  private async loadStats(): Promise<void> {
    try {
      const result = await this.analytics.getAdminStats();
      this.stats.set(result);
    } catch (e) {
      console.error('Failed to load admin stats:', e);
    } finally {
      this.statsLoading.set(false);
    }
  }

  adminStats(): { total: number; pending: number; approved: number } {
    return this.admin.stats(this.owners());
  }
}

