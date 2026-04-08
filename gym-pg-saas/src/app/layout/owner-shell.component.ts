import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { TranslationService } from '../core/services/translation.service';
import { LanguageSwitcherComponent } from '../shared/language-switcher.component';
import { TranslatePipe } from '../shared/pipes/translate.pipe';
import { BrandLogoComponent } from '../shared/brand-logo.component';

@Component({
  selector: 'app-owner-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, LanguageSwitcherComponent, BrandLogoComponent],
  templateUrl: './owner-shell.component.html',
})
export class OwnerShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly i18n = inject(TranslationService);

  readonly profile = this.auth.profile;
  readonly isPgOwner = computed(() => this.profile()?.businessType === 'pg');
  readonly ownerInitial = computed(() => {
    const n = this.profile()?.name?.trim();
    if (!n) return '?';
    return n.charAt(0).toUpperCase();
  });

  readonly mobileMenuOpen = signal(false);
  readonly userMenuOpen = signal(false);

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
