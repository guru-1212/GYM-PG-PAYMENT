import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { Complaint, ComplaintService } from '../../core/services/complaint.service';

@Component({
  selector: 'app-complaints-page',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './complaints-page.component.html',
})
export class ComplaintsPageComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly complaintsApi = inject(ComplaintService);
  private unsub: (() => void) | null = null;

  readonly loading = signal(true);
  readonly complaints = signal<Complaint[]>([]);
  readonly openCount = computed(() => this.complaints().filter((c) => c.status === 'open').length);

  async ngOnInit(): Promise<void> {
    await this.auth.refreshProfile();
    const ownerId = this.auth.profile()?.ownerId;
    if (!ownerId) {
      this.loading.set(false);
      return;
    }
    this.unsub = this.complaintsApi.watchComplaintsForOwner(ownerId, (rows) => {
      this.complaints.set(rows);
      this.loading.set(false);
    });
  }

  ngOnDestroy(): void {
    this.unsub?.();
  }
}

