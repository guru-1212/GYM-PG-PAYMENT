import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { getAuth } from 'firebase/auth';
import { FirebaseAppService } from '../../core/services/firebase-app.service';

/**
 * PWA `start_url` landing. Sends signed-in tenants straight to `/member-app/home`,
 * everyone else to `/member-app/login` (which restores `/member-app/install/:code`
 * from localStorage when available).
 */
@Component({
  selector: 'app-member-app-entry',
  standalone: true,
  template:
    '<main class="mae"><p class="mae-text">Opening tenant app…</p></main>',
  styles: [
    `
      .mae {
        min-height: 100dvh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(160deg, #0f172a 0%, #134e4a 45%, #1e1b4b 100%);
      }
      .mae-text {
        margin: 0;
        font-size: 0.95rem;
        color: #e2e8f0;
      }
    `,
  ],
})
export class MemberAppEntryComponent implements OnInit {
  private readonly fb = inject(FirebaseAppService);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    const auth = getAuth(this.fb.app);
    const user = auth.currentUser;
    if (user) {
      try {
        const t = await user.getIdTokenResult();
        if (String(t.claims['role'] || '') === 'member_app') {
          await this.router.navigateByUrl('/member-app/home', { replaceUrl: true });
          return;
        }
      } catch {
        /* fall through */
      }
    }
    await this.router.navigateByUrl('/member-app/login', { replaceUrl: true });
  }
}
