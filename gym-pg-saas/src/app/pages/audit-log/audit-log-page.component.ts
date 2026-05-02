import { DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AUDIT_ACTION_ICONS,
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_TONES,
  AuditAction,
  AuditActorRole,
  AuditLog,
  AuditTone,
} from '../../core/models/audit-log.model';
import { AuditLogService } from '../../core/services/audit-log.service';
import { AuthService } from '../../core/services/auth.service';
import { timestampToDate } from '../../core/utils/date.utils';

interface ActionFilterOption {
  value: AuditAction | 'all';
  label: string;
}

interface ActorFilterOption {
  value: 'all' | string; // 'all' | uid
  label: string;
  role?: AuditActorRole;
}

interface AuditRowVm extends AuditLog {
  actionLabel: string;
  icon: string;
  tone: AuditTone;
  date: Date | null;
  timeOfDay: string;
  dayKey: string;
  dateLabel: string;
  performedByLabelText: string;
}

interface AuditDayGroup {
  dayKey: string;
  label: string;
  rows: AuditRowVm[];
}

interface SummaryCard {
  label: string;
  value: string;
  hint: string;
  icon: string;
  tone: AuditTone;
}

/** Quick-pick date window applied to the audit trail filter. */
export type AuditDateRange =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'last14'
  | 'thisMonth'
  | 'custom';

interface AuditRangePreset {
  id: AuditDateRange;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-audit-log-page',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe],
  templateUrl: './audit-log-page.component.html',
})
export class AuditLogPageComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly auditApi = inject(AuditLogService);

  readonly profile = this.auth.profile;
  readonly rows = signal<AuditLog[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Filters (signals so view recomputes instantly). */
  readonly searchQuery = signal('');
  readonly actionFilter = signal<AuditAction | 'all'>('all');
  readonly actorFilter = signal<'all' | string>('all');
  readonly fromDate = signal<string>('');
  readonly toDate = signal<string>('');
  /** Active quick-range chip. `custom` = user typed dates manually. */
  readonly quickRange = signal<AuditDateRange>('all');

  /** Quick-range chips rendered in the filter bar. */
  readonly rangePresets: AuditRangePreset[] = [
    { id: 'today', label: 'Today', icon: 'today' },
    { id: 'yesterday', label: 'Yesterday', icon: 'event_available' },
    { id: 'thisWeek', label: 'This week', icon: 'calendar_view_week' },
    { id: 'last14', label: 'Last 14 days', icon: 'date_range' },
    { id: 'thisMonth', label: 'This month', icon: 'calendar_month' },
  ];

  private unsub: (() => void) | null = null;

  /** All distinct actors discovered in the loaded rows (for the filter pill). */
  readonly actorOptions = computed<ActorFilterOption[]>(() => {
    const seen = new Map<string, ActorFilterOption>();
    for (const row of this.rows()) {
      if (!row.performedBy) continue;
      if (seen.has(row.performedBy)) continue;
      const label = row.performedByName?.trim()
        ? `${row.performedByName} · ${this.roleLabel(row.performedByRole)}`
        : `${this.roleLabel(row.performedByRole)} ${row.performedByLabel || ''}`.trim();
      seen.set(row.performedBy, {
        value: row.performedBy,
        label,
        role: row.performedByRole,
      });
    }
    const list = [...seen.values()];
    list.sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: 'all', label: 'All users' }, ...list];
  });

  /** Action filter options derived from the labels map. */
  readonly actionOptions: ActionFilterOption[] = [
    { value: 'all', label: 'All activity' },
    ...Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({
      value: value as AuditAction,
      label,
    })),
  ];

  readonly hasActiveFilters = computed(() => {
    return (
      this.searchQuery().trim().length > 0 ||
      this.actionFilter() !== 'all' ||
      this.actorFilter() !== 'all' ||
      this.fromDate() !== '' ||
      this.toDate() !== ''
    );
  });

  /** Filtered + decorated rows ordered newest-first. */
  readonly filteredRows = computed<AuditRowVm[]>(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const action = this.actionFilter();
    const actor = this.actorFilter();
    const from = this.fromDate() ? new Date(this.fromDate() + 'T00:00:00') : null;
    const to = this.toDate() ? new Date(this.toDate() + 'T23:59:59') : null;
    const list: AuditRowVm[] = [];
    for (const row of this.rows()) {
      if (action !== 'all' && row.action !== action) continue;
      if (actor !== 'all' && row.performedBy !== actor) continue;
      const date = timestampToDate(row.timestamp) || timestampToDate(row.createdAt);
      if (from && date && date < from) continue;
      if (to && date && date > to) continue;
      if (q) {
        const blob = [
          row.description,
          row.entityLabel,
          row.performedByName,
          row.performedByLabel,
          AUDIT_ACTION_LABELS[row.action] || row.action,
          row.action,
          row.amount?.toString(),
          ...(row.meta ? Object.values(row.meta) : []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!blob.includes(q)) continue;
      }
      list.push(this.decorate(row, date));
    }
    return list;
  });

  /** Group rows by calendar day for the timeline view. */
  readonly groupedRows = computed<AuditDayGroup[]>(() => {
    const groups = new Map<string, AuditDayGroup>();
    for (const r of this.filteredRows()) {
      const existing = groups.get(r.dayKey);
      if (existing) {
        existing.rows.push(r);
      } else {
        groups.set(r.dayKey, {
          dayKey: r.dayKey,
          label: r.dateLabel,
          rows: [r],
        });
      }
    }
    return [...groups.values()];
  });

  /** Top-level summary tiles displayed above the timeline. */
  readonly summary = computed<SummaryCard[]>(() => {
    const list = this.filteredRows();
    const totalCash = list
      .filter((r) =>
        r.action === 'payment.collected' ||
        r.action === 'payment.partialCollected' ||
        r.action === 'payment.pendingCollected',
      )
      .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
    const memberMutations = list.filter((r) => r.entityType === 'member').length;
    const supervisorActivity = list.filter((r) => r.performedByRole === 'supervisor').length;
    return [
      {
        label: 'Total events',
        value: list.length.toLocaleString('en-IN'),
        hint: this.hasActiveFilters() ? 'Matching filters' : 'Across the trail',
        icon: 'history',
        tone: 'blue',
      },
      {
        label: 'Cash collected',
        value: '₹' + Math.round(totalCash).toLocaleString('en-IN'),
        hint: 'Sum of payment events',
        icon: 'savings',
        tone: 'green',
      },
      {
        label: 'Member changes',
        value: memberMutations.toLocaleString('en-IN'),
        hint: 'Add / edit / remove / status',
        icon: 'manage_accounts',
        tone: 'amber',
      },
      {
        label: 'Supervisor actions',
        value: supervisorActivity.toLocaleString('en-IN'),
        hint: 'Performed by supervisors',
        icon: 'supervisor_account',
        tone: 'slate',
      },
    ];
  });

  ngOnInit(): void {
    const ownerId = this.profile()?.ownerId;
    if (!ownerId) {
      this.loading.set(false);
      this.error.set('Sign in as an owner to view the audit trail.');
      return;
    }
    this.unsub = this.auditApi.watchLogs(ownerId, (rows) => {
      this.rows.set(rows);
      this.loading.set(false);
      this.error.set(null);
    });
  }

  ngOnDestroy(): void {
    this.unsub?.();
    this.unsub = null;
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.actionFilter.set('all');
    this.actorFilter.set('all');
    this.fromDate.set('');
    this.toDate.set('');
    this.quickRange.set('all');
  }

  /** Convert a typed `Event.target.value` to the right signal value. */
  onActionChange(value: string): void {
    this.actionFilter.set((value as AuditAction | 'all') || 'all');
  }

  onActorChange(value: string): void {
    this.actorFilter.set(value || 'all');
  }

  /**
   * Apply a preset date window. Toggling the active chip clears the range.
   * Also updates the From / To inputs so the user can see the resolved window.
   */
  setQuickRange(id: AuditDateRange): void {
    if (this.quickRange() === id) {
      this.fromDate.set('');
      this.toDate.set('');
      this.quickRange.set('all');
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    let from: Date | null = null;
    let to: Date | null = today;

    switch (id) {
      case 'today':
        from = new Date(today);
        break;
      case 'yesterday': {
        const y = new Date(today);
        y.setDate(today.getDate() - 1);
        from = y;
        to = new Date(y);
        break;
      }
      case 'thisWeek': {
        // Monday-anchored week (ISO style). Sunday = 0 → treat as 7th day.
        const day = today.getDay() === 0 ? 7 : today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - (day - 1));
        from = monday;
        break;
      }
      case 'last14': {
        const start = new Date(today);
        start.setDate(today.getDate() - 13);
        from = start;
        break;
      }
      case 'thisMonth':
        from = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      default:
        from = null;
        to = null;
    }

    this.fromDate.set(from ? fmt(from) : '');
    this.toDate.set(to ? fmt(to) : '');
    this.quickRange.set(id);
  }

  /** Manual date input handler — switches the active chip to `custom`. */
  onFromDateChange(value: string): void {
    this.fromDate.set(value);
    this.syncQuickRangeFromInputs();
  }

  onToDateChange(value: string): void {
    this.toDate.set(value);
    this.syncQuickRangeFromInputs();
  }

  private syncQuickRangeFromInputs(): void {
    if (!this.fromDate() && !this.toDate()) {
      this.quickRange.set('all');
    } else {
      this.quickRange.set('custom');
    }
  }

  /* -------------------- presentation helpers -------------------- */

  private decorate(row: AuditLog, date: Date | null): AuditRowVm {
    const dayKey = date
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      : 'unknown';
    return {
      ...row,
      actionLabel: AUDIT_ACTION_LABELS[row.action] || this.titleCase(row.action),
      icon: AUDIT_ACTION_ICONS[row.action] || 'history',
      tone: AUDIT_ACTION_TONES[row.action] || 'slate',
      date,
      timeOfDay: date
        ? date.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : '—',
      dayKey,
      dateLabel: this.dayLabel(date),
      performedByLabelText: this.formatActor(row),
    };
  }

  private formatActor(row: AuditLog): string {
    const name = row.performedByName?.trim() || 'Unknown';
    const role = this.roleLabel(row.performedByRole);
    return `${name} · ${role}`;
  }

  roleLabel(role: AuditActorRole): string {
    switch (role) {
      case 'owner':
        return 'Owner';
      case 'supervisor':
        return 'Supervisor';
      case 'admin':
        return 'Admin';
      default:
        return 'User';
    }
  }

  private dayLabel(date: Date | null): string {
    if (!date) return 'Unknown date';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  private titleCase(input: string): string {
    return input
      .split('.')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' › ');
  }

  trackRow(_idx: number, row: AuditRowVm): string {
    return row.id;
  }

  trackGroup(_idx: number, group: AuditDayGroup): string {
    return group.dayKey;
  }

  /** Convert the input change event to a string safely. */
  inputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
  }

  /* -------------------------------------------------------------
   * Tone-driven class helpers
   *
   * These return precomputed Tailwind class strings rather than
   * relying on `[class.dark:bg-emerald-950/50]` style bindings, because
   * the Angular template parser rejects `/` inside `[class.X]` binding
   * keys (Tailwind opacity modifiers like `dark:bg-rose-950/40`).
   * ----------------------------------------------------------- */

  /** Border + bg classes for the summary cards. */
  summaryCardClasses(tone: AuditTone): string {
    switch (tone) {
      case 'green':
        return 'border-emerald-100 dark:border-emerald-900/50';
      case 'amber':
        return 'border-amber-100 dark:border-amber-900/50';
      case 'blue':
        return 'border-indigo-100 dark:border-indigo-900/50';
      case 'red':
        return 'border-rose-100 dark:border-rose-900/50';
      default:
        return 'border-slate-200 dark:border-slate-700';
    }
  }

  /** Background + text classes for tone-coded icon pills. */
  toneIconClasses(tone: AuditTone): string {
    switch (tone) {
      case 'green':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300';
      case 'amber':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300';
      case 'blue':
        return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300';
      case 'red':
        return 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
    }
  }

  /** Border classes used by the mobile timeline cards. */
  mobileCardClasses(tone: AuditTone): string {
    switch (tone) {
      case 'green':
        return 'border-emerald-100 dark:border-emerald-900/40';
      case 'amber':
        return 'border-amber-100 dark:border-amber-900/40';
      case 'blue':
        return 'border-indigo-100 dark:border-indigo-900/40';
      case 'red':
        return 'border-rose-100 dark:border-rose-900/40';
      default:
        return 'border-slate-200 dark:border-slate-700';
    }
  }

  /** Background colour for the round avatar of the actor. */
  roleAvatarClasses(role: AuditActorRole): string {
    switch (role) {
      case 'owner':
        return 'bg-indigo-600';
      case 'supervisor':
        return 'bg-emerald-600';
      case 'admin':
        return 'bg-slate-700';
      default:
        return 'bg-slate-500';
    }
  }

  /** Text colour for the role label below the actor name. */
  roleTextClasses(role: AuditActorRole): string {
    switch (role) {
      case 'owner':
        return 'text-indigo-600 dark:text-indigo-300';
      case 'supervisor':
        return 'text-emerald-700 dark:text-emerald-300';
      case 'admin':
        return 'text-slate-700 dark:text-slate-300';
      default:
        return 'text-slate-600 dark:text-slate-300';
    }
  }

  /** Pill background for the mobile actor badge. */
  roleBadgeClasses(role: AuditActorRole): string {
    switch (role) {
      case 'owner':
        return 'bg-indigo-50 text-indigo-700 ring-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900/50';
      case 'supervisor':
        return 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/50';
      case 'admin':
        return 'bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700';
      default:
        return 'bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
    }
  }
}
