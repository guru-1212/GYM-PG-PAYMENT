import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ComplaintService } from '../../core/services/complaint.service';
import { applyDigitsOnlyFromInput } from '../../core/utils/validators';

@Component({
  selector: 'app-public-complaint-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './public-complaint-page.component.html',
})
export class PublicComplaintPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly complaintsApi = inject(ComplaintService);

  readonly ownerId = signal((this.route.snapshot.paramMap.get('ownerId') || '').trim());
  readonly loading = signal(false);
  /** null until first settings fetch finishes */
  readonly featureEnabled = signal<boolean | null>(null);
  readonly settingsLoading = signal(true);
  readonly submitSuccess = signal(false);
  readonly errorMessage = signal('');

  readonly form = this.fb.nonNullable.group({
    mobile: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
    message: ['', [Validators.required, Validators.minLength(5)]],
  });

  onMobileInput(event: Event): void {
    applyDigitsOnlyFromInput(this.form.controls.mobile, event, 10);
  }

  constructor() {
    void this.loadOwnerSetting();
  }

  private async loadOwnerSetting(): Promise<void> {
    try {
      const ownerId = this.ownerId();
      if (!ownerId) {
        this.featureEnabled.set(false);
        this.errorMessage.set('Invalid complaint link');
        return;
      }
      const enabled = await this.complaintsApi.isComplaintEnabled(ownerId);
      this.featureEnabled.set(enabled);
      if (enabled) {
        this.errorMessage.set('');
      } else {
        this.errorMessage.set(
          `Complaints are off for this gym, or the settings document is missing. The owner should enable complaints in the app and sign in once so Firebase has publicOwnerComplaintSettings/${ownerId}.`,
        );
      }
    } finally {
      this.settingsLoading.set(false);
    }
  }

  async submit(): Promise<void> {
    this.errorMessage.set('');
    this.submitSuccess.set(false);
    if (this.featureEnabled() !== true) {
      this.errorMessage.set('Feature disabled');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const ownerId = this.ownerId();
    const mobile = this.form.controls.mobile.value.trim();
    const message = this.form.controls.message.value.trim();

    this.loading.set(true);
    try {
      try {
        const isValidMember = await this.complaintsApi.memberExistsByMobile(ownerId, mobile);
        if (!isValidMember) {
          this.errorMessage.set('Invalid mobile');
          return;
        }
      } catch (e) {
        this.errorMessage.set(this.mapComplaintError(e, 'memberCheck'));
        return;
      }

      try {
        await this.complaintsApi.submitComplaint({ ownerId, memberMobile: mobile, message });
        this.submitSuccess.set(true);
        this.form.reset({ mobile, message: '' });
      } catch (e) {
        this.errorMessage.set(this.mapComplaintError(e, 'submit'));
      }
    } finally {
      this.loading.set(false);
    }
  }

  private mapComplaintError(err: unknown, stage: 'memberCheck' | 'submit'): string {
    const fromObj =
      err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : '';
    const msg = err instanceof Error ? err.message : '';
    const code =
      fromObj ||
      (msg.includes('permission-denied') ? 'permission-denied' : '') ||
      (msg.includes('failed-precondition') ? 'failed-precondition' : '');
    if (code.includes('permission-denied')) {
      if (stage === 'memberCheck') return 'Configuration error: member validation blocked by Firebase rules';
      return 'Configuration error: complaint submit blocked by Firebase rules';
    }
    if (code.includes('failed-precondition')) {
      return 'Database index required for complaint checks. Please create Firestore index and retry.';
    }
    return 'Could not submit complaint. Please try again.';
  }
}

