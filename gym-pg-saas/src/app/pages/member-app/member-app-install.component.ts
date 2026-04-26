import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { FirebaseAppService } from '../../core/services/firebase-app.service';
import { applyDigitsOnlyFromInput } from '../../core/utils/validators';

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

  readonly busy = signal(false);
  readonly errorMessage = signal('');
  readonly ownerId = signal<string | null>(null);
  readonly code = signal<string>('');
  readonly loadError = signal('');

  readonly mobileForm = this.formBuilder.nonNullable.group({
    mobile: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
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
    } catch {
      this.loadError.set('Could not read this install link. Check your connection and try again.');
    }
  }

  onMobileInput(event: Event): void {
    applyDigitsOnlyFromInput(this.mobileForm.controls.mobile, event, 10);
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
      const functions = getFunctions(this.fb.app);
      const verify = httpsCallable(functions, 'verifyMemberForApp');
      const res = await verify({
        installCode,
        ownerId: oid,
        mobile: this.mobileForm.controls.mobile.value,
      });
      const data = res.data as { customToken?: string };
      if (!data.customToken) {
        this.errorMessage.set('Server did not return a login token. Ask the owner to deploy Cloud Functions.');
        return;
      }
      const auth = getAuth(this.fb.app);
      await signInWithCustomToken(auth, data.customToken);
      await this.router.navigateByUrl('/member-app/home');
    } catch (e: unknown) {
      const fe = e as { code?: string; message?: string };
      const code = String(fe?.code || '');
      const msg = String(fe?.message || '');
      if (code === 'functions/failed-precondition' || /already linked|already-activated/i.test(msg)) {
        this.errorMessage.set(
          'This number is already set up on the member app. Open the app from your phone’s home screen. Signing in again from a new phone is not allowed.',
        );
      } else if (code === 'functions/not-found' || msg.includes('not-found') || msg.includes('NOT_FOUND')) {
        this.errorMessage.set('This mobile number does not match our records for this property.');
      } else if (code === 'functions/permission-denied' || msg.includes('permission') || msg.includes('PERMISSION')) {
        this.errorMessage.set('This QR code is invalid or no longer active.');
      } else {
        this.errorMessage.set(
          'Could not sign you in. If this keeps happening, ask the owner to deploy the latest Cloud Functions (verifyMemberForApp).',
        );
      }
    } finally {
      this.busy.set(false);
    }
  }
}
