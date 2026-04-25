import { Component, OnInit, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { DataCacheService } from '../../core/services/data-cache.service';
import type { Member } from '../../core/models/member.model';

// ── SVG chart dimension constants ─────────────────────────────────────────────
const B_W = 520, B_H = 240, B_PL = 60, B_PR = 10, B_PT = 16, B_PB = 44;
const B_AW = B_W - B_PL - B_PR; // 450
const B_AH = B_H - B_PT - B_PB; // 180
const B_BOT = B_PT + B_AH;      // 196

const L_W = 520, L_H = 200, L_PL = 46, L_PR = 10, L_PT = 14, L_PB = 38;
const L_AW = L_W - L_PL - L_PR; // 464
const L_AH = L_H - L_PT - L_PB; // 148
const L_BOT = L_PT + L_AH;      // 162

// ── SVG arc helpers ────────────────────────────────────────────────────────────
function ptOnCircle(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutArcPath(
  cx: number, cy: number, outerR: number, innerR: number,
  startDeg: number, endDeg: number,
): string {
  const gap = 1.8;
  const s = startDeg + gap, e = endDeg - gap;
  if (e - s <= 0) return '';
  const large = e - s > 180 ? 1 : 0;
  const o1 = ptOnCircle(cx, cy, outerR, s), o2 = ptOnCircle(cx, cy, outerR, e);
  const i1 = ptOnCircle(cx, cy, innerR, e), i2 = ptOnCircle(cx, cy, innerR, s);
  return `M${o1.x} ${o1.y} A${outerR} ${outerR} 0 ${large} 1 ${o2.x} ${o2.y}` +
    ` L${i1.x} ${i1.y} A${innerR} ${innerR} 0 ${large} 0 ${i2.x} ${i2.y}Z`;
}

function pieArcPath(
  cx: number, cy: number, r: number,
  startDeg: number, endDeg: number,
): string {
  const gap = 1.8;
  const s = startDeg + gap, e = endDeg - gap;
  if (e - s <= 0) return '';
  const large = e - s > 180 ? 1 : 0;
  const p1 = ptOnCircle(cx, cy, r, s), p2 = ptOnCircle(cx, cy, r, e);
  return `M${cx} ${cy} L${p1.x} ${p1.y} A${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y}Z`;
}

function fmtAxis(v: number): string {
  if (v >= 100000) return (v / 100000).toFixed(1).replace(/\.0$/, '') + 'L';
  if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(v);
}

// ── Interfaces ─────────────────────────────────────────────────────────────────
export interface SvgBar {
  x: number; y: number; w: number; h: number; cx: number; lblY: number;
  total: number; label: string;
}
export interface YTick { y: number; label: string; }
export interface LinePoint { x: number; y: number; count: number; label: string; }
export interface Segment { d: string; color: string; label: string; count: number; pct: number; }
export interface HBarItem { label: string; total: number; pct: number; color: string; }
export interface RoomCell { roomNumber: string; beds: number; occ: number; }
export interface FloorRow { label: string; rooms: RoomCell[]; }

// ── Component ──────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-analytics-page',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './analytics-page.component.html',
})
export class AnalyticsPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly cache = inject(DataCacheService);

  readonly profile = this.auth.profile;
  readonly isPg = computed(() => this.profile()?.businessType === 'pg');

  readonly members = this.cache.members;
  readonly payments = this.cache.payments;
  readonly layout = this.cache.layout;

  // ── Member aggregates ────────────────────────────────────────────────────────
  readonly active = computed(() => this.members().filter(m => m.status === 'active'));
  readonly inactive = computed(() => this.members().filter(m => m.status === 'inactive'));

  readonly cntCompleted = computed(() =>
    this.members().filter(m => m.selfOnboardingStatus === 'completed').length);
  readonly cntReview = computed(() =>
    this.members().filter(m => Boolean((m as Member & { pendingSelfOnboarding?: unknown }).pendingSelfOnboarding)).length);
  readonly cntPending = computed(() =>
    this.members().filter(m => !m.selfOnboardingStatus || m.selfOnboardingStatus === 'pending').length);

  // ── Payment aggregates ───────────────────────────────────────────────────────
  readonly thisMonthEarnings = computed(() => {
    const now = new Date();
    return this.payments()
      .filter(p => { const d = p.date?.toDate?.(); return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); })
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  });

  readonly totalEarnings = computed(() =>
    this.payments().reduce((s, p) => s + (Number(p.amount) || 0), 0));

  // ── SVG: Earnings bar chart ──────────────────────────────────────────────────
  readonly monthlyRaw = computed(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const y = d.getFullYear(), m = d.getMonth();
      const total = this.payments()
        .filter(p => { const pd = p.date?.toDate?.(); return pd && pd.getFullYear() === y && pd.getMonth() === m; })
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      return {
        label: d.toLocaleString('en-IN', { month: 'short' }) + ' \'' + String(y).slice(-2),
        total,
      };
    });
  });

  readonly earningsMax = computed(() => Math.max(1, ...this.monthlyRaw().map(m => m.total)));

  readonly earningsBars = computed<SvgBar[]>(() => {
    const data = this.monthlyRaw();
    const max = this.earningsMax();
    const groupW = B_AW / data.length;
    const barW = Math.min(52, groupW * 0.64);
    const barGap = (groupW - barW) / 2;
    return data.map((d, i) => {
      const h = (d.total / max) * B_AH;
      const cx = B_PL + i * groupW + groupW / 2;
      return { x: B_PL + i * groupW + barGap, y: B_BOT - h, w: barW, h, cx, lblY: B_BOT + 14, total: d.total, label: d.label };
    });
  });

  readonly earningsYAxis = computed<YTick[]>(() => {
    const max = this.earningsMax();
    return [0, 0.25, 0.5, 0.75, 1].map(p => ({
      y: B_BOT - p * B_AH,
      label: p === 0 ? '0' : fmtAxis(Math.round(max * p)),
    }));
  });

  // ── SVG: Member growth line chart ────────────────────────────────────────────
  readonly growthRaw = computed(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const cutoff = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const count = this.members().filter(m => { const jd = m.joinDate?.toDate?.(); return jd && jd <= cutoff; }).length;
      return { label: d.toLocaleString('en-IN', { month: 'short' }), count };
    });
  });

  readonly growthMax = computed(() => Math.max(1, ...this.growthRaw().map(g => g.count)));

  readonly growthPoints = computed<LinePoint[]>(() => {
    const data = this.growthRaw();
    const max = this.growthMax();
    const n = data.length;
    const dx = n > 1 ? L_AW / (n - 1) : 0;
    return data.map((d, i) => ({
      x: L_PL + i * dx,
      y: L_PT + L_AH - (d.count / max) * L_AH,
      count: d.count,
      label: d.label,
    }));
  });

  readonly growthPolyline = computed(() =>
    this.growthPoints().map(p => `${p.x},${p.y}`).join(' '));

  readonly growthAreaPath = computed(() => {
    const pts = this.growthPoints();
    if (!pts.length) return '';
    return `M${pts[0].x},${L_BOT} ` + pts.map(p => `L${p.x},${p.y}`).join(' ') + ` L${pts[pts.length - 1].x},${L_BOT}Z`;
  });

  readonly growthYAxis = computed<YTick[]>(() => {
    const max = this.growthMax();
    return [0, 0.25, 0.5, 0.75, 1].map(p => ({
      y: L_BOT - p * L_AH,
      label: String(Math.round(max * p)),
    }));
  });

  // ── SVG: Profile status donut ────────────────────────────────────────────────
  readonly profileSegs = computed<Segment[]>(() => {
    const total = this.members().length || 1;
    const data = [
      { label: 'Completed', count: this.cntCompleted(), color: '#10b981' },
      { label: 'In Review', count: this.cntReview(), color: '#6366f1' },
      { label: 'Pending', count: this.cntPending(), color: '#f59e0b' },
    ].filter(d => d.count > 0);
    let start = -90;
    return data.map(d => {
      const sweep = (d.count / total) * 360;
      const seg: Segment = { ...d, pct: d.count / total, d: donutArcPath(90, 90, 78, 52, start, start + sweep) };
      start += sweep;
      return seg;
    });
  });

  // ── SVG: Subscription type pie ───────────────────────────────────────────────
  readonly subscriptionSegs = computed<Segment[]>(() => {
    const ms = this.active();
    const total = ms.length || 1;
    const items = [
      { label: 'Monthly', count: ms.filter(m => !m.subscriptionType || m.subscriptionType === 'monthly').length, color: '#6366f1' },
      { label: 'Quarterly', count: ms.filter(m => m.subscriptionType === 'quarterly').length, color: '#0ea5e9' },
      { label: 'Yearly', count: ms.filter(m => m.subscriptionType === 'yearly').length, color: '#10b981' },
    ].filter(d => d.count > 0);
    let start = -90;
    return items.map(d => {
      const sweep = (d.count / total) * 360;
      const seg: Segment = { ...d, pct: d.count / total, d: pieArcPath(90, 90, 76, start, start + sweep) };
      start += sweep;
      return seg;
    });
  });

  // ── Horizontal bars: payment methods ────────────────────────────────────────
  readonly paymentMethodBars = computed<HBarItem[]>(() => {
    const ps = this.payments();
    const sum = (m: string) => ps.filter(p => p.method === m).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const cash = sum('cash'), upi = sum('upi'), card = sum('card');
    const mx = Math.max(1, cash, upi, card);
    return [
      { label: 'Cash', total: cash, pct: cash / mx, color: '#f59e0b' },
      { label: 'UPI', total: upi, pct: upi / mx, color: '#6366f1' },
      { label: 'Card', total: card, pct: card / mx, color: '#0ea5e9' },
    ];
  });

  // ── Horizontal bars: gender breakdown (gym) ──────────────────────────────────
  readonly genderBars = computed<HBarItem[]>(() => {
    const ms = this.active();
    const cnt = (g: string) => ms.filter(m => m.gender === g).length;
    const male = cnt('male'), female = cnt('female'), other = cnt('other'),
      none = ms.filter(m => !m.gender).length;
    const mx = Math.max(1, male, female, other, none);
    return [
      { label: 'Male', total: male, pct: male / mx, color: '#6366f1' },
      { label: 'Female', total: female, pct: female / mx, color: '#ec4899' },
      { label: 'Other', total: other, pct: other / mx, color: '#10b981' },
      { label: 'Unknown', total: none, pct: none / mx, color: '#94a3b8' },
    ].filter(b => b.total > 0);
  });

  // ── Room heatmap (PG) ────────────────────────────────────────────────────────
  readonly totalBeds = computed(() => {
    const l = this.layout();
    if (!l) return 0;
    return l.floors.reduce((s, f) => s + f.rooms.reduce((rs, r) => rs + r.beds, 0), 0);
  });

  readonly occupiedBeds = computed(() =>
    this.active().filter(m => m.roomNumber).length);

  readonly roomGrid = computed<FloorRow[]>(() => {
    const l = this.layout();
    if (!l?.floors.length) return [];
    const active = this.active();
    return l.floors.map(fl => ({
      label: fl.floorNumber === 0 ? 'Ground Floor' : `Floor ${fl.floorNumber}`,
      rooms: fl.rooms.map(rm => {
        const occ = active.filter(m =>
          Number(m.floorNumber) === fl.floorNumber && Number(m.roomNumber) === rm.roomNumber).length;
        return { roomNumber: String(rm.roomNumber), beds: rm.beds, occ };
      }),
    }));
  });

  // ── Template helpers ─────────────────────────────────────────────────────────
  fmtRupee(v: number): string {
    if (v >= 100000) return '₹' + (v / 100000).toFixed(1).replace(/\.0$/, '') + 'L';
    if (v >= 1000) return '₹' + (v / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return '₹' + v;
  }

  heatBg(occ: number, beds: number): string {
    if (beds === 0) return '#f1f5f9';
    const p = occ / beds;
    if (p === 0) return '#f0fdf4';
    if (p < 0.5) return '#bbf7d0';
    if (p < 1) return '#4ade80';
    return '#fca5a5';
  }

  heatBorder(occ: number, beds: number): string {
    if (beds === 0) return '#e2e8f0';
    const p = occ / beds;
    if (p === 0) return '#d1fae5';
    if (p < 0.5) return '#86efac';
    if (p < 1) return '#22c55e';
    return '#f87171';
  }

  heatText(occ: number, beds: number): string {
    return occ >= beds ? '#991b1b' : '#14532d';
  }

  ngOnInit(): void {
    const ownerId = this.profile()?.ownerId;
    if (!ownerId) return;
    this.cache.loadMembers(ownerId);
    this.cache.loadPayments(ownerId);
    if (this.isPg()) {
      this.cache.loadLayout(ownerId);
    }
  }
}
