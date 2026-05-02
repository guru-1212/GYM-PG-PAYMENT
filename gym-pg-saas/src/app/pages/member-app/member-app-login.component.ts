import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

const LS_CODE = 'memberApp.installCode';

/**
 * Fallback tenant entry when the PWA opens without a URL fragment. If the
 * device already stored an install code (first visit went through the QR
 * `/member-app/install/:code` page), bounce straight back there.
 */
@Component({
  selector: 'app-member-app-login',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './member-app-login.component.html',
  styles: [
    `
      .mal {
        min-height: 100dvh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.25rem;
        background: linear-gradient(160deg, #0f172a 0%, #134e4a 42%, #1e1b4b 100%);
      }

      .mal-card {
        width: 100%;
        max-width: 26rem;
        border-radius: 1.25rem;
        padding: 1.75rem 1.5rem;
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(148, 163, 184, 0.25);
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(12px);
      }

      .mal-kicker {
        margin: 0 0 0.35rem;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #5eead4;
      }

      .mal-h1 {
        margin: 0 0 0.75rem;
        font-size: 1.45rem;
        font-weight: 700;
        color: #f8fafc;
      }

      .mal-lead {
        margin: 0 0 1rem;
        font-size: 0.92rem;
        line-height: 1.55;
        color: #cbd5e1;
      }

      .mal-steps {
        margin: 0 0 1.25rem;
        padding-left: 1.1rem;
        font-size: 0.88rem;
        line-height: 1.55;
        color: #e2e8f0;
      }

      .mal-muted {
        margin: 0 0 1.25rem;
        font-size: 0.82rem;
        line-height: 1.5;
        color: #94a3b8;
      }

      .mal-actions {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
      }

      .mal-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.65rem 1rem;
        border-radius: 0.75rem;
        font-size: 0.9rem;
        font-weight: 600;
        text-decoration: none;
        transition: opacity 0.15s ease;
      }

      .mal-btn:hover {
        opacity: 0.92;
      }

      .mal-btn--secondary {
        background: #f8fafc;
        color: #0f172a;
      }

      .mal-btn--ghost {
        background: transparent;
        color: #94a3b8;
        border: 1px solid rgba(148, 163, 184, 0.35);
      }
    `,
  ],
})
export class MemberAppLoginComponent implements OnInit {
  private readonly router = inject(Router);

  ngOnInit(): void {
    try {
      const code = localStorage.getItem(LS_CODE)?.trim();
      if (code) {
        const url = '/member-app/install/' + encodeURIComponent(code);
        void this.router.navigateByUrl(url, { replaceUrl: true });
      }
    } catch {
      /* stay on instructions page */
    }
  }
}
