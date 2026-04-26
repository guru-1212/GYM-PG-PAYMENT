import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import QRCode from 'qrcode';
import { AuthService } from '../../core/services/auth.service';
import { MemberBroadcastService } from '../../core/services/member-broadcast.service';
import { MemberInstallQrService } from '../../core/services/member-install-qr.service';
import { ToastService } from '../../core/services/toast.service';
import { NotificationBellComponent } from '../../shared/notification-bell/notification-bell.component';

@Component({
  selector: 'app-owner-notify-members-page',
  standalone: true,
  imports: [ReactiveFormsModule, NotificationBellComponent],
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
  readonly qrDataUrl = signal<string | null>(null);
  readonly qrBusy = signal(false);
  readonly sendBusy = signal(false);

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    body: ['', [Validators.required, Validators.maxLength(4000)]],
  });

  async ngOnInit(): Promise<void> {
    await this.loadInstallLink();
  }

  /** One permanent link per owner; safe to call again (reuses same Firestore code). */
  async loadInstallLink(): Promise<void> {
    const oid = this.profile()?.ownerId;
    if (!oid || this.profile()?.role !== 'owner') {
      return;
    }
    this.qrBusy.set(true);
    this.qrDataUrl.set(null);
    try {
      const { installUrl, created } = await this.qr.getOrCreateInstallLink();
      this.qrUrl.set(installUrl);
      try {
        const dataUrl = await QRCode.toDataURL(installUrl, {
          width: 280,
          margin: 2,
          errorCorrectionLevel: 'M',
        });
        this.qrDataUrl.set(dataUrl);
      } catch {
        this.toast.error('Could not render QR image. Members can still use the link below.');
      }
      if (created) {
        this.toast.success('Member install link created. This same QR works for all your members — they only sign in once each.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load install link.';
      this.toast.error(msg);
      this.qrUrl.set('');
      this.qrDataUrl.set(null);
    } finally {
      this.qrBusy.set(false);
    }
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
}
