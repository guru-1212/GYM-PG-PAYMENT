import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MemberJoinIntakeService } from '../../core/services/member-join-intake.service';
import { applyDigitsOnlyFromInput, optionalDigitsLen } from '../../core/utils/validators';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

type Stage = 'loading' | 'form' | 'done' | 'error';

@Component({
  selector: 'app-member-join-intake-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './member-join-intake-page.component.html',
})
export class MemberJoinIntakePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(MemberJoinIntakeService);
  private readonly fb = inject(FormBuilder);

  readonly stage = signal<Stage>('loading');
  readonly errorMessage = signal('');
  readonly busy = signal(false);
  readonly token = signal('');
  readonly businessName = signal('');

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.pattern(/^[^0-9]*$/)]],
    lastName: ['', [Validators.pattern(/^[^0-9]*$/)]],
    mobile: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
    aadhaarNumber: ['', optionalDigitsLen(12)],
    address: ['', [Validators.required, Validators.maxLength(500)]],
  });

  async ngOnInit(): Promise<void> {
    const t = this.route.snapshot.paramMap.get('token') || '';
    this.token.set(t);
    if (!t) {
      this.fail('joinIntake.invalid');
      return;
    }
    try {
      const intake = await this.api.readIntake(t);
      this.businessName.set(intake.businessName || '');
      if (intake.status === 'submitted' || intake.status === 'completed') {
        this.fail('joinIntake.alreadyUsed');
        return;
      }
      if (intake.status === 'dismissed' || intake.status === 'revoked') {
        this.fail('joinIntake.revoked');
        return;
      }
      if (!this.api.isIntakeOpenForPublicForm(intake)) {
        this.fail('joinIntake.expired');
        return;
      }
      this.stage.set('form');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'INTAKE_NOT_FOUND') this.fail('joinIntake.notFound');
      else this.fail('joinIntake.loadError');
    }
  }

  private fail(key: string): void {
    this.errorMessage.set(key);
    this.stage.set('error');
  }

  onMobileInput(event: Event): void {
    applyDigitsOnlyFromInput(this.form.controls.mobile, event, 10);
  }

  onAadhaarInput(event: Event): void {
    applyDigitsOnlyFromInput(this.form.controls.aadhaarNumber, event, 12);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const t = this.token();
    if (!t) return;
    this.busy.set(true);
    try {
      const v = this.form.getRawValue();
      await this.api.submitIntake(t, {
        firstName: v.firstName,
        lastName: v.lastName || '',
        mobile: v.mobile,
        aadhaarNumber: v.aadhaarNumber || '',
        address: v.address,
      });
      this.stage.set('done');
    } catch {
      this.fail('joinIntake.submitError');
    } finally {
      this.busy.set(false);
    }
  }

  goHome(): void {
    void this.router.navigateByUrl('/');
  }
}
