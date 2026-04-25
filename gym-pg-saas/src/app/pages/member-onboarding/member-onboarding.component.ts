import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import type { MemberOnboardingLink } from '../../core/models/member-onboarding.model';
import {
  MemberOnboardingService,
  type OnboardingPhotoKind,
} from '../../core/services/member-onboarding.service';
import { ToastService } from '../../core/services/toast.service';
import { compressImageForUpload } from '../../core/utils/image-upload.util';
import { applyDigitsOnlyFromInput } from '../../core/utils/validators';

type Stage = 'loading' | 'verify' | 'fill' | 'done' | 'error';

@Component({
  selector: 'app-member-onboarding',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './member-onboarding.component.html',
})
export class MemberOnboardingComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(MemberOnboardingService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly stage = signal<Stage>('loading');
  readonly errorMessage = signal<string>('');
  readonly busy = signal<boolean>(false);
  readonly token = signal<string>('');
  readonly link = signal<MemberOnboardingLink | null>(null);

  readonly profilePhotoFile = signal<File | null>(null);
  readonly aadhaarFrontFile = signal<File | null>(null);
  readonly aadhaarBackFile = signal<File | null>(null);
  readonly profilePhotoPreview = signal<string>('');
  readonly aadhaarFrontPreview = signal<string>('');
  readonly aadhaarBackPreview = signal<string>('');

  readonly memberDisplayName = computed(() => {
    const p = this.link()?.prefill;
    if (!p) return '';
    return `${p.firstName || ''} ${p.lastName || ''}`.trim();
  });

  readonly businessName = computed(() => this.link()?.prefill?.businessName || '');

  readonly verifyForm = this.fb.nonNullable.group({
    mobile: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
  });

  readonly detailsForm = this.fb.nonNullable.group({
    firstName: ['', Validators.required],
    lastName: [''],
    email: ['', [Validators.email]],
    gender: this.fb.control<'' | 'male' | 'female' | 'other'>(''),
    address: [''],
    aadhaarNumber: ['', [Validators.pattern(/^\d{12}$/)]],
  });

  async ngOnInit(): Promise<void> {
    const t = this.route.snapshot.paramMap.get('token') || '';
    this.token.set(t);
    if (!t) {
      this.failWith('This link is invalid.');
      return;
    }
    try {
      const link = await this.api.readToken(t);
      this.link.set(link);
      if (link.status === 'used') return this.failWith('This link has already been used.');
      if (link.status === 'revoked') return this.failWith('This link was revoked.');
      if (!this.api.isLinkOpenForUse(link)) return this.failWith('This link has expired.');
      if ((link.attempts || 0) >= 5) return this.failWith('Too many wrong attempts. Ask your owner for a new link.');
      this.stage.set('verify');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'LINK_NOT_FOUND') return this.failWith('This link is invalid.');
      this.failWith('Could not load this link. Please try again later.');
    }
  }

  private failWith(msg: string): void {
    this.errorMessage.set(msg);
    this.stage.set('error');
  }

  onMobileInput(event: Event): void {
    applyDigitsOnlyFromInput(this.verifyForm.controls.mobile, event, 10);
  }

  onAadhaarInput(event: Event): void {
    applyDigitsOnlyFromInput(this.detailsForm.controls.aadhaarNumber, event, 12);
  }

  async submitVerify(): Promise<void> {
    if (this.verifyForm.invalid) {
      this.verifyForm.markAllAsTouched();
      return;
    }
    const mobile = this.verifyForm.controls.mobile.value;
    this.busy.set(true);
    try {
      const { verified } = await this.api.tryVerifyMobile(this.token(), mobile);
      if (!verified) {
        // Re-read for updated attempts count.
        const fresh = await this.api.readToken(this.token());
        this.link.set(fresh);
        if ((fresh.attempts || 0) >= 5) {
          this.failWith('Too many wrong attempts. Ask your owner for a new link.');
          return;
        }
        const left = Math.max(0, 5 - (fresh.attempts || 0));
        this.toast.error(`Mobile number does not match. ${left} attempt${left === 1 ? '' : 's'} left.`);
        return;
      }
      // Verified — refresh link and pre-fill details form.
      const fresh = await this.api.readToken(this.token());
      this.link.set(fresh);
      const p = fresh.prefill || {};
      this.detailsForm.patchValue({
        firstName: p.firstName || '',
        lastName: p.lastName || '',
        email: p.email || '',
        gender: (p.gender as '' | 'male' | 'female' | 'other') || '',
        address: p.address || '',
        aadhaarNumber: p.aadhaarNumber || '',
      });
      this.profilePhotoPreview.set(p.profilePhotoUrl || '');
      this.aadhaarFrontPreview.set(p.aadhaarFrontUrl || '');
      this.aadhaarBackPreview.set(p.aadhaarBackUrl || '');
      this.stage.set('fill');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'LINK_LOCKED') return this.failWith('Too many wrong attempts. Ask your owner for a new link.');
      if (msg === 'LINK_EXPIRED') return this.failWith('This link has expired.');
      if (msg === 'LINK_NOT_ACTIVE') return this.failWith('This link is no longer active.');
      this.toast.error('Could not verify. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

  onPhotoSelected(kind: OnboardingPhotoKind, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files.length ? input.files[0] : null;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.toast.error('Please choose an image file (JPG / PNG / WEBP).');
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.toast.error('Image must be smaller than 5 MB.');
      input.value = '';
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    if (kind === 'profile') {
      this.profilePhotoFile.set(file);
      this.profilePhotoPreview.set(previewUrl);
    } else if (kind === 'aadhaarFront') {
      this.aadhaarFrontFile.set(file);
      this.aadhaarFrontPreview.set(previewUrl);
    } else {
      this.aadhaarBackFile.set(file);
      this.aadhaarBackPreview.set(previewUrl);
    }
  }

  async submitDetails(): Promise<void> {
    if (this.detailsForm.invalid) {
      this.detailsForm.markAllAsTouched();
      return;
    }
    const link = this.link();
    if (!link) return;
    const v = this.detailsForm.getRawValue();
    this.busy.set(true);
    try {
      const profileFile = this.profilePhotoFile();
      const aadhaarFront = this.aadhaarFrontFile();
      const aadhaarBack = this.aadhaarBackFile();

      const hasProfile = Boolean(profileFile || link.prefill?.profilePhotoUrl);
      const hasFront = Boolean(aadhaarFront || link.prefill?.aadhaarFrontUrl);
      const hasBack = Boolean(aadhaarBack || link.prefill?.aadhaarBackUrl);
      if (!hasProfile || !hasFront || !hasBack) {
        this.toast.error("Please add your profile photo and both sides of your Aadhaar card.");
        return;
      }

      let profilePhotoUrl = link.prefill?.profilePhotoUrl || '';
      let aadhaarFrontUrl = link.prefill?.aadhaarFrontUrl || '';
      let aadhaarBackUrl = link.prefill?.aadhaarBackUrl || '';

      const [profileReady, frontReady, backReady] = await Promise.all([
        profileFile ? compressImageForUpload(profileFile) : Promise.resolve<File | null>(null),
        aadhaarFront ? compressImageForUpload(aadhaarFront) : Promise.resolve<File | null>(null),
        aadhaarBack ? compressImageForUpload(aadhaarBack) : Promise.resolve<File | null>(null),
      ]);

      const [pUrl, fUrl, bUrl] = await Promise.all([
        profileReady
          ? this.api.uploadPublicPhoto(this.token(), 'profile', profileReady)
          : Promise.resolve(profilePhotoUrl),
        frontReady
          ? this.api.uploadPublicPhoto(this.token(), 'aadhaarFront', frontReady)
          : Promise.resolve(aadhaarFrontUrl),
        backReady
          ? this.api.uploadPublicPhoto(this.token(), 'aadhaarBack', backReady)
          : Promise.resolve(aadhaarBackUrl),
      ]);
      profilePhotoUrl = pUrl;
      aadhaarFrontUrl = fUrl;
      aadhaarBackUrl = bUrl;

      await this.api.submitOnboarding(this.token(), link.memberId, {
        email: v.email || '',
        lastName: v.lastName || '',
        gender: (v.gender as 'male' | 'female' | 'other' | '') || '',
        address: v.address || '',
        aadhaarNumber: v.aadhaarNumber || '',
        profilePhotoUrl,
        aadhaarFrontUrl,
        aadhaarBackUrl,
      });

      this.stage.set('done');
    } catch (e) {
      const msg =
        e instanceof Error && e.message === 'MISSING_PHOTOS'
          ? 'Profile photo and both Aadhaar images are required.'
          : e instanceof Error
            ? e.message
            : 'Could not submit. Please try again.';
      this.toast.error(msg);
    } finally {
      this.busy.set(false);
    }
  }

  goHome(): void {
    void this.router.navigateByUrl('/');
  }
}
