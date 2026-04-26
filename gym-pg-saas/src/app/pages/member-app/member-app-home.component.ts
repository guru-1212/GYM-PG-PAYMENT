import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { getAuth, signOut } from 'firebase/auth';
import { FirebaseAppService } from '../../core/services/firebase-app.service';
import { MemberAppPushService } from '../../core/services/member-app-push.service';
import type { OwnerBroadcast } from '../../core/services/member-broadcast.service';
import { MemberBroadcastService } from '../../core/services/member-broadcast.service';
import { TranslationService } from '../../core/services/translation.service';
import { NotificationBellComponent } from '../../shared/notification-bell/notification-bell.component';

@Component({
  selector: 'app-member-app-home',
  standalone: true,
  imports: [DatePipe, NotificationBellComponent],
  templateUrl: './member-app-home.component.html',
  styleUrl: './member-app-home.component.scss',
})
export class MemberAppHomeComponent implements OnInit, OnDestroy {
  private readonly fbApp = inject(FirebaseAppService);
  private readonly router = inject(Router);
  private readonly broadcasts = inject(MemberBroadcastService);
  private readonly push = inject(MemberAppPushService);
  private readonly i18n = inject(TranslationService);

  readonly ownerId = signal<string | null>(null);
  readonly memberId = signal<string | null>(null);
  readonly rows = signal<OwnerBroadcast[]>([]);
  private unsub: (() => void) | null = null;

  /** From custom token claims (set when owner activates the member app). */
  readonly memberDisplayName = signal('Member');
  readonly pgDisplayName = signal('your property');

  readonly welcomeHi = computed(() => {
    this.i18n.lang();
    return this.i18n.t('memberApp.welcomeHi', { name: this.memberDisplayName() });
  });

  readonly welcomeBody = computed(() => {
    this.i18n.lang();
    return this.i18n.t('memberApp.welcomeBody', { pg: this.pgDisplayName() });
  });

  readonly welcomeNote = computed(() => {
    this.i18n.lang();
    return this.i18n.t('memberApp.welcomeNote');
  });

  async ngOnInit(): Promise<void> {
    const auth = getAuth(this.fbApp.app);
    const user = auth.currentUser;
    if (!user) {
      await this.router.navigateByUrl('/');
      return;
    }
    await user.getIdToken(true);
    const token = await user.getIdTokenResult();
    const oid = typeof token.claims['ownerId'] === 'string' ? token.claims['ownerId'] : null;
    const mid = typeof token.claims['memberId'] === 'string' ? token.claims['memberId'] : null;
    if (token.claims['role'] !== 'member_app' || !oid || !mid) {
      await this.router.navigateByUrl('/');
      return;
    }
    const mn = typeof token.claims['memberDisplayName'] === 'string' ? token.claims['memberDisplayName'].trim() : '';
    const pg = typeof token.claims['ownerBusinessName'] === 'string' ? token.claims['ownerBusinessName'].trim() : '';
    if (mn) this.memberDisplayName.set(mn);
    if (pg) this.pgDisplayName.set(pg);

    this.ownerId.set(oid);
    this.memberId.set(mid);
    this.unsub = this.broadcasts.watchBroadcasts(oid, (list) => this.rows.set(list));
    void this.push.registerDeviceToken(oid, mid);
  }

  ngOnDestroy(): void {
    this.unsub?.();
    this.unsub = null;
  }

  async logout(): Promise<void> {
    await signOut(getAuth(this.fbApp.app));
    await this.router.navigateByUrl('/');
  }
}
