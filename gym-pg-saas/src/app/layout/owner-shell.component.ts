import { Component, HostListener, computed, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { MemberService } from '../core/services/member.service';
import { PaymentService } from '../core/services/payment.service';
import { TranslationService } from '../core/services/translation.service';
import { TranslatePipe } from '../shared/pipes/translate.pipe';
import { BrandLogoComponent } from '../shared/brand-logo.component';
import { MonthlyEarningsComponent } from '../shared/monthly-earnings.component';
import { Member } from '../core/models/member.model';
import { Payment } from '../core/models/payment.model';

@Component({
  selector: 'app-owner-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, BrandLogoComponent, MonthlyEarningsComponent],
  templateUrl: './owner-shell.component.html',
})
export class OwnerShellComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly membersApi = inject(MemberService);
  private readonly paymentsApi = inject(PaymentService);
  readonly i18n = inject(TranslationService);

  private unsubM: (() => void) | undefined;
  private unsubP: (() => void) | undefined;

  readonly profile = this.auth.profile;
  readonly isPgOwner = computed(() => this.profile()?.businessType === 'pg');
  readonly ownerInitial = computed(() => {
    const n = this.profile()?.name?.trim();
    if (!n) return '?';
    return n.charAt(0).toUpperCase();
  });

  readonly mobileMenuOpen = signal(false);
  readonly userMenuOpen = signal(false);
  readonly showMonthlyEarnings = signal(false);
  readonly members = signal<Member[]>([]);
  readonly payments = signal<Payment[]>([]);

  openMobileMenu(): void {
    this.closeUserMenu();
    this.mobileMenuOpen.set(true);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  toggleUserMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.userMenuOpen.update((v) => !v);
  }

  closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }

  openMonthlyEarnings(): void {
    this.showMonthlyEarnings.set(true);
  }

  ngOnInit(): void {
    const ownerId = this.auth.profile()?.ownerId;
    if (ownerId) {
      this.loadMembers(ownerId);
      this.loadPayments(ownerId);
    }
  }

  private loadMembers(ownerId: string): void {
    this.unsubM?.();
    this.unsubM = this.membersApi.watchMembersForOwner(ownerId, (members) => {
      this.members.set(members);
    });
  }

  private loadPayments(ownerId: string): void {
    this.unsubP?.();
    this.unsubP = this.paymentsApi.watchPaymentsForOwner(ownerId, (payments) => {
      this.payments.set(payments);
    });
  }

  ngOnDestroy(): void {
    this.unsubM?.();
    this.unsubP?.();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const el = ev.target as HTMLElement | null;
    if (el?.closest('[data-user-menu-root]')) return;
    this.userMenuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.mobileMenuOpen()) {
      this.closeMobileMenu();
    }
    if (this.userMenuOpen()) {
      this.closeUserMenu();
    }
  }

  async signOut(): Promise<void> {
    this.closeMobileMenu();
    this.closeUserMenu();
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
