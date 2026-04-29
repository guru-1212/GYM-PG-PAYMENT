import { DatePipe } from '@angular/common';
import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { Complaint, ComplaintService } from '../../core/services/complaint.service';
import { ToastService } from '../../core/services/toast.service';

type StatusFilter = 'all' | 'open' | 'resolved';

@Component({
  selector: 'app-complaints-page',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './complaints-page.component.html',
})
export class ComplaintsPageComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly complaintsApi = inject(ComplaintService);
  private readonly toast = inject(ToastService);

  private unsub: (() => void) | null = null;

  readonly loading = signal(true);
  readonly complaints = signal<Complaint[]>([]);
  readonly statusFilter = signal<StatusFilter>('all');
  readonly categoryFilter = signal<string>('');
  readonly searchQuery = signal<string>('');
  readonly resolvingId = signal<string | null>(null);
  readonly resolutionNote = signal<string>('');
  readonly resolveTargetId = signal<string | null>(null);

  readonly openCount = computed(
    () => this.complaints().filter((c) => c.status === 'open').length,
  );
  readonly resolvedCount = computed(
    () => this.complaints().filter((c) => c.status === 'resolved').length,
  );
  readonly totalCount = computed(() => this.complaints().length);

  readonly categories = computed(() => {
    const set = new Set<string>();
    for (const c of this.complaints()) {
      if (c.category) set.add(c.category);
    }
    return Array.from(set).sort();
  });

  readonly filtered = computed(() => {
    const status = this.statusFilter();
    const cat = this.categoryFilter().trim();
    const q = this.searchQuery().trim().toLowerCase();
    return this.complaints().filter((c) => {
      if (status !== 'all' && c.status !== status) return false;
      if (cat && c.category !== cat) return false;
      if (q) {
        const haystack = [
          c.memberName,
          c.memberMobile,
          c.roomNumber,
          c.floorNumber,
          c.message,
          c.category,
        ]
          .map((v) => String(v || '').toLowerCase())
          .join(' ');
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  });

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

  setStatusFilter(s: StatusFilter): void {
    this.statusFilter.set(s);
  }

  setCategoryFilter(c: string): void {
    this.categoryFilter.set(c);
  }

  setSearch(q: string): void {
    this.searchQuery.set(q);
  }

  openResolve(complaintId: string): void {
    this.resolveTargetId.set(complaintId);
    this.resolutionNote.set('');
  }

  cancelResolve(): void {
    this.resolveTargetId.set(null);
    this.resolutionNote.set('');
  }

  async confirmResolve(): Promise<void> {
    const id = this.resolveTargetId();
    if (!id) return;
    this.resolvingId.set(id);
    try {
      await this.complaintsApi.markResolved(id, this.resolutionNote());
      this.toast.success('Complaint marked as resolved.');
      this.resolveTargetId.set(null);
      this.resolutionNote.set('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not resolve.';
      this.toast.error(msg);
    } finally {
      this.resolvingId.set(null);
    }
  }

  callMember(mobile: string | undefined): void {
    const m = String(mobile || '').replace(/\D/g, '');
    if (!m) return;
    window.location.href = `tel:${m}`;
  }

  whatsappMember(c: Complaint): void {
    const digits = String(c.memberMobile || '').replace(/\D/g, '');
    if (!digits) return;
    const intl = digits.length === 10 ? `91${digits}` : digits;
    const text = encodeURIComponent(
      `Hi ${c.memberName || ''}, regarding your complaint: "${c.message?.slice(0, 200) || ''}"`,
    );
    window.open(`https://wa.me/${intl}?text=${text}`, '_blank', 'noopener,noreferrer');
  }
}
