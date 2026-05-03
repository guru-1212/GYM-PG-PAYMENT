import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable, httpsCallableFromURL } from 'firebase/functions';
import { FirebaseAppService } from '../../core/services/firebase-app.service';
import { OwnerPublicStatusService } from '../../core/services/owner-public-status.service';
import { PwaInstallService } from '../../core/services/pwa-install.service';
import { ToastService } from '../../core/services/toast.service';
import { applyDigitsOnlyFromInput } from '../../core/utils/validators';
import { environment } from '../../../environments/environment';

/** Last successful tenant sign-in for this device (per owner). Not a password — still verified server-side. */
const MEMBER_SIGNIN_CREDENTIAL_LS = 'memberApp.signInCredential';

function readStoredMemberCredential(ownerId: string): { mobile: string; aadhaarLast4: string } | null {
  try {
    const raw = localStorage.getItem(MEMBER_SIGNIN_CREDENTIAL_LS);
    if (!raw) return null;
    const o = JSON.parse(raw) as { v?: number; ownerId?: string; mobile?: string; aadhaarLast4?: string };
    if (o?.ownerId !== ownerId || o?.v !== 1) return null;
    const mobile = String(o.mobile || '').replace(/\D/g, '').slice(-10);
    const a4 = String(o.aadhaarLast4 || '').replace(/\D/g, '').slice(-4);
    if (mobile.length !== 10 || a4.length !== 4) return null;
    return { mobile, aadhaarLast4: a4 };
  } catch {
    return null;
  }
}

function writeStoredMemberCredential(ownerId: string, mobile: string, aadhaarLast4: string): void {
  try {
    localStorage.setItem(
      MEMBER_SIGNIN_CREDENTIAL_LS,
      JSON.stringify({
        v: 1,
        ownerId,
        mobile: mobile.replace(/\D/g, '').slice(-10),
        aadhaarLast4: aadhaarLast4.replace(/\D/g, '').slice(-4),
      }),
    );
  } catch {
    /* private mode / quota */
  }
}

@Component({
  selector: 'app-member-app-install',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './member-app-install.component.html',
  styleUrl: './member-app-install.component.scss',
})
export class MemberAppInstallComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FirebaseAppService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly pwa = inject(PwaInstallService);
  private readonly toast = inject(ToastService);
  private readonly ownerPublicStatus = inject(OwnerPublicStatusService);

  readonly busy = signal(false);
  readonly errorMessage = signal('');
  readonly ownerId = signal<string | null>(null);
  readonly ownerBusinessName = signal<string>('');
  readonly code = signal<string>('');
  readonly loadError = signal('');
  /** True when mobile + Aadhaar last 4 were restored from this browser's saved sign-in. */
  readonly credentialFromDevice = signal(false);

  readonly canInstall = this.pwa.canInstall;
  readonly isInstalled = this.pwa.isInstalled;
  readonly isIosSafari = this.pwa.isIosSafari;
  /** Show install CTA on the tenant install page when the app isn't yet on the home screen. */
  readonly showInstallCta = computed(
    () => !this.isInstalled() && (this.canInstall() || this.isIosSafari()),
  );

  readonly mobileForm = this.formBuilder.nonNullable.group({
    mobile: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
    aadhaarLast4: ['', [Validators.required, Validators.pattern(/^\d{4}$/)]],
  });

  async ngOnInit(): Promise<void> {
    const c = this.route.snapshot.paramMap.get('code') || '';
    this.code.set(c);
    if (!c) {
      this.loadError.set('Missing install code. Scan the QR from your owner again.');
      return;
    }
    try {
      const ref = doc(this.fb.db, 'memberInstallQrCodes', c);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        this.loadError.set('This QR code is not valid.');
        return;
      }
      const data = snap.data() as { ownerId?: string; active?: boolean };
      if (!data.active || !data.ownerId) {
        this.loadError.set('This install link is no longer active. Ask your owner for a new QR.');
        return;
      }
      this.ownerId.set(data.ownerId);
      try {
        localStorage.setItem('memberApp.installCode', c);
        localStorage.setItem('memberApp.ownerId', data.ownerId);
      } catch {
        /* private mode — PWA entry will fall back to /member-app/login */
      }
      const saved = readStoredMemberCredential(data.ownerId);
      if (saved) {
        this.mobileForm.patchValue({ mobile: saved.mobile, aadhaarLast4: saved.aadhaarLast4 });
        this.credentialFromDevice.set(true);
      }
      // Show the PG / Gym name on the install card so the tenant can confirm
      // they scanned the right QR before they type their mobile + Aadhaar last 4.
      this.ownerPublicStatus.watchStatus(data.ownerId, (status) => {
        if (status?.businessName) this.ownerBusinessName.set(status.businessName);
      });
    } catch {
      this.loadError.set('Could not read this install link. Check your connection and try again.');
    }
  }

  onMobileInput(event: Event): void {
    applyDigitsOnlyFromInput(this.mobileForm.controls.mobile, event, 10);
  }

  onAadhaarLast4Input(event: Event): void {
    applyDigitsOnlyFromInput(this.mobileForm.controls.aadhaarLast4, event, 4);
  }

  async installApp(): Promise<void> {
    const outcome = await this.pwa.promptInstall();
    if (outcome === 'accepted') {
      this.toast.success('App installed. Open it from your home screen any time.');
    } else if (outcome === 'unavailable' && !this.isIosSafari()) {
      this.toast.success('Open your browser menu → "Install app" / "Add to Home Screen".');
    }
  }

  async continue(): Promise<void> {
    if (this.mobileForm.invalid) {
      this.mobileForm.markAllAsTouched();
      return;
    }
    const oid = this.ownerId();
    const installCode = this.code();
    if (!oid || !installCode) return;
    this.busy.set(true);
    this.errorMessage.set('');
    try {
      const functions = getFunctions(this.fb.app, 'us-central1');
      const configured = environment.verifyMemberCallableUrl?.trim() || null;
      const isLocal =
        typeof window !== 'undefined' &&
        /^localhost$|^127\.0\.0\.1$/i.test(window.location.hostname);
      const sameOrigin =
        !isLocal && typeof window !== 'undefined'
          ? `${window.location.origin}/api-fn/verifyMemberForApp`
          : null;
      const url = configured || sameOrigin;
      const verify = url ? httpsCallableFromURL(functions, url) : httpsCallable(functions, 'verifyMemberForApp');
      const res = await verify({
        installCode,
        ownerId: oid,
        mobile: this.mobileForm.controls.mobile.value,
        aadhaarLast4: this.mobileForm.controls.aadhaarLast4.value.trim(),
      });
      const data = res.data as { customToken?: string };
      if (!data.customToken) {
        this.errorMessage.set('Server did not return a login token. Ask the owner to deploy Cloud Functions.');
        return;
      }
      const auth = getAuth(this.fb.app);
      await signInWithCustomToken(auth, data.customToken);
      writeStoredMemberCredential(
        oid,
        this.mobileForm.controls.mobile.value,
        this.mobileForm.controls.aadhaarLast4.value.trim(),
      );
      await this.router.navigateByUrl('/member-app/home');
    } catch (e: unknown) {
      const fe = e as { code?: string; message?: string };
      const code = String(fe?.code || '');
      const msg = String(fe?.message || '');
      // Member exists but the owner has not yet stored their Aadhaar number.
      // Show a polite, specific message instead of the generic mismatch one.
      if (/aadhaar-not-on-file/i.test(msg)) {
        this.errorMessage.set(
          'Your Aadhaar number is not on file with this property yet. Please visit your owner and ask them to update your profile, then try signing in again.',
        );
      } else if (/member-inactive/i.test(msg)) {
        this.errorMessage.set(
          'Your profile is not active for this property. Please contact your owner.',
        );
      } else if (/tenant-member-app-disabled/i.test(msg)) {
        this.errorMessage.set(
          'Tenant sign-in is not turned on for this property yet, or it was disabled. Please contact your owner or try again after the owner is approved in the system.',
        );
      } else if (/firestore-index-required/i.test(msg)) {
        this.errorMessage.set(
          'Sign-in is blocked until the database finishes setting up for this project. Ask the owner to deploy Firestore indexes (firebase deploy --only firestore:indexes), wait until indexes show as ready in Firebase Console, then try again.',
        );
      } else if (/auth-custom-token-iam/i.test(msg)) {
        this.errorMessage.set(
          'Sign-in could not be completed due to a project configuration issue. Ask the owner or their developer to fix Firebase custom-token IAM (Service Account Token Creator on the default App Engine service account), then try again.',
        );
      } else if (/already linked|linked to the app/i.test(msg)) {
        // Legacy Cloud Function still deployed — local code allows re-login.
        this.errorMessage.set(
          'This property is still running an older sign-in service that blocks repeat logins. Ask the owner to redeploy the latest Cloud Functions (verifyMemberForApp) for this Firebase project, then try again.',
        );
      } else if (
        code === 'functions/permission-denied' ||
        /do not match|does not match|invalid or inactive/i.test(msg)
      ) {
        // Single generic message — server does not reveal which field was wrong.
        this.errorMessage.set(
          'These details do not match our records. Please double-check your mobile number and the last 4 digits of your Aadhaar with your owner.',
        );
      } else if (code === 'functions/not-found' || msg.includes('not-found') || msg.includes('NOT_FOUND')) {
        this.errorMessage.set('These details do not match our records for this property.');
      } else if (/CORS|Failed to fetch|NetworkError|Load failed|network request failed/i.test(msg)) {
        this.errorMessage.set(
          'Could not reach the sign-in service (often a missing deploy or blocked cloudfunctions.net). Deploy verifyMemberForApp to us-central1 for this Firebase project, or set verifyMemberCallableUrl to your Hosting rewrite (see firebase.json / environment).',
        );
      } else {
        this.errorMessage.set(
          'Could not sign you in. Ask the owner to open Firebase Console → Functions → verifyMemberForApp → Logs; a 500 usually means a server error (indexes, IAM, or data), not only an outdated deploy.',
        );
      }
    } finally {
      this.busy.set(false);
    }
  }
}