import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import QRCode from 'qrcode';
import { AuthService } from '../../core/services/auth.service';
import {
  MemberBroadcastService,
  type OwnerBroadcast,
} from '../../core/services/member-broadcast.service';
import { MemberInstallQrService } from '../../core/services/member-install-qr.service';
import { ToastService } from '../../core/services/toast.service';
import { NotificationBellComponent } from '../../shared/notification-bell/notification-bell.component';

@Component({
  selector: 'app-owner-notify-members-page',
  standalone: true,
  imports: [ReactiveFormsModule, NotificationBellComponent, DatePipe],
  templateUrl: './owner-notify-members-page.component.html',
  styleUrl: './owner-notify-members-page.component.scss',
})
export class OwnerNotifyMembersPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly qr = inject(MemberInstallQrService);
  private readonly broadcast = inject(MemberBroadcastService);
  private readonly fb = inject(FormBuilder);

  readonly profile = this.auth.profile;
  readonly qrUrl = signal('');
  /** 280px on-screen preview (PNG data URL). */
  readonly qrDataUrl = signal<string | null>(null);
  /** 1024px high-resolution PNG used for download + print. */
  readonly qrHiResDataUrl = signal<string | null>(null);
  readonly qrBusy = signal(false);
  readonly sendBusy = signal(false);
  readonly copying = signal(false);

  /** Property name printed on the poster — falls back to owner's name. */
  readonly propertyName = computed(() => {
    const p = this.profile();
    return (p?.businessName || p?.name || 'Your Property').trim();
  });

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    body: ['', [Validators.required, Validators.maxLength(4000)]],
  });

  /** Broadcasts already sent to all members (live from Firestore). */
  readonly broadcastHistory = signal<OwnerBroadcast[]>([]);

  constructor() {
    effect((onCleanup) => {
      const p = this.profile();
      const oid = p?.ownerId;
      if (!oid || p?.role !== 'owner') {
        this.broadcastHistory.set([]);
        return;
      }
      const unsub = this.broadcast.watchBroadcasts(
        oid,
        (rows) => this.broadcastHistory.set(rows),
        () => this.broadcastHistory.set([]),
        { limit: 100 },
      );
      onCleanup(() => unsub());
    });
  }

  async ngOnInit(): Promise<void> {
    // Auto-load on first paint so the QR is immediately visible — owners
    // arriving on this page expect to see it without an extra click.
    await this.loadInstallLink({ silent: true });
  }

  /** One permanent link per owner; safe to call again (reuses same Firestore code). */
  async loadInstallLink(opts: { silent?: boolean } = {}): Promise<void> {
    const oid = this.profile()?.ownerId;
    if (!oid || this.profile()?.role !== 'owner') {
      return;
    }
    this.qrBusy.set(true);
    this.qrDataUrl.set(null);
    this.qrHiResDataUrl.set(null);
    try {
      const { installUrl, created } = await this.qr.getOrCreateInstallLink();
      this.qrUrl.set(installUrl);
      try {
        const [preview, hiRes] = await Promise.all([
          QRCode.toDataURL(installUrl, {
            width: 280,
            margin: 2,
            errorCorrectionLevel: 'M',
          }),
          // High-resolution version — generated once, used for both PNG
          // download and the print poster (so the tenant sees a crisp QR
          // even at A4 size).
          QRCode.toDataURL(installUrl, {
            width: 1024,
            margin: 3,
            errorCorrectionLevel: 'H',
          }),
        ]);
        this.qrDataUrl.set(preview);
        this.qrHiResDataUrl.set(hiRes);
      } catch {
        this.toast.error('Could not render QR image. Members can still use the link below.');
      }
      if (created && !opts.silent) {
        this.toast.success(
          'Member install QR created. The same QR works for everyone — print it once, all your members can scan.',
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load install link.';
      if (!opts.silent) this.toast.error(msg);
      this.qrUrl.set('');
      this.qrDataUrl.set(null);
      this.qrHiResDataUrl.set(null);
    } finally {
      this.qrBusy.set(false);
    }
  }

  async copyLink(): Promise<void> {
    const url = this.qrUrl();
    if (!url) return;
    this.copying.set(true);
    try {
      await navigator.clipboard.writeText(url);
      this.toast.success('Link copied. Share it via WhatsApp or SMS.');
    } catch {
      this.toast.error('Could not copy link. Long-press the link to copy manually.');
    } finally {
      setTimeout(() => this.copying.set(false), 600);
    }
  }

  /** Download the high-res QR as a PNG so the owner can take it to a print shop. */
  downloadQr(): void {
    const dataUrl = this.qrHiResDataUrl();
    if (!dataUrl) return;
    const safeName = this.propertyName()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'property';
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `member-app-qr-${safeName}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /**
   * Open a clean, printable poster in a new window — just QR, property name,
   * and short tenant instructions. The owner clicks Print and sticks it on
   * the noticeboard.
   */
  printPoster(): void {
    const dataUrl = this.qrHiResDataUrl();
    const url = this.qrUrl();
    if (!dataUrl || !url) {
      this.toast.error('Load the QR first.');
      return;
    }
    const propertyName = this.escapeHtml(this.propertyName());
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Member App — ${propertyName}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #0f172a;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: linear-gradient(160deg, #f0fdfa 0%, #ffffff 50%, #eef2ff 100%);
  }
  .poster {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 28mm 18mm 22mm;
  }
  .kicker {
    display: inline-block;
    padding: 6px 14px;
    border-radius: 999px;
    background: #ecfeff;
    color: #0e7490;
    border: 1px solid #a5f3fc;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  h1 {
    margin: 18px 0 6px;
    font-size: 38px;
    font-weight: 800;
    text-align: center;
    letter-spacing: -0.01em;
  }
  .property {
    margin: 0 0 18px;
    font-size: 22px;
    font-weight: 700;
    color: #0d9488;
    text-align: center;
  }
  .qr-frame {
    border: 2px solid #0d9488;
    background: white;
    border-radius: 18px;
    padding: 18px;
    box-shadow: 0 18px 36px rgba(13, 148, 136, 0.18);
  }
  .qr-frame img { display: block; width: 78mm; height: 78mm; }
  .steps {
    list-style: none;
    margin: 24px 0 0;
    padding: 0;
    width: 100%;
    max-width: 150mm;
    display: grid;
    gap: 10px;
  }
  .steps li {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    background: white;
    border: 1px solid #e2e8f0;
    font-size: 14px;
    line-height: 1.45;
  }
  .steps .num {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 999px;
    background: #0d9488;
    color: white;
    font-weight: 800;
    font-size: 13px;
  }
  .footer {
    margin-top: 18px;
    text-align: center;
    color: #64748b;
    font-size: 11px;
  }
  .footer code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 10px;
    color: #334155;
    word-break: break-all;
  }
  @media print {
    body { background: white; }
    .qr-frame { box-shadow: none; }
  }
</style></head>
<body>
  <div class="poster">
    <div style="text-align:center;">
      <span class="kicker">Tenant App</span>
      <h1>Scan to install your tenant app</h1>
      <p class="property">${propertyName}</p>
      <div class="qr-frame"><img src="${dataUrl}" alt="Install QR" /></div>
    </div>

    <ol class="steps">
      <li><span class="num">1</span><span>Open your phone camera and point it at the QR above.</span></li>
      <li><span class="num">2</span><span>Tap the link that appears, then tap <b>Install</b> to add the app to your home screen.</span></li>
      <li><span class="num">3</span><span>Sign in with your <b>registered mobile number</b> and the <b>last 4 digits of your Aadhaar</b>.</span></li>
      <li><span class="num">4</span><span>Inside the app you can download rent receipts, view dues, and raise complaints.</span></li>
    </ol>

    <div class="footer">
      <p>If the camera does not open the link, type this URL into your browser:</p>
      <code>${this.escapeHtml(url)}</code>
    </div>
  </div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>
</body></html>`;
    const win = window.open('', '_blank', 'width=900,height=1200');
    if (!win) {
      this.toast.error('Browser blocked the print window. Allow pop-ups for this site and try again.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  async sendBroadcast(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const oid = this.profile()?.ownerId;
    if (!oid) return;
    this.sendBusy.set(true);
    try {
      const v = this.form.getRawValue();
      await this.broadcast.sendBroadcast(oid, v.title, v.body);
      this.form.reset();
      this.toast.success('Message sent. Members with the app will get a push notification when Cloud Functions are deployed.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Send failed.';
      this.toast.error(msg);
    } finally {
      this.sendBusy.set(false);
    }
  }

  private escapeHtml(s: string): string {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Table preview column — full text in `title` attribute on the cell. */
  truncateBody(text: string, max: number): string {
    const t = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max)}…`;
  }
}
