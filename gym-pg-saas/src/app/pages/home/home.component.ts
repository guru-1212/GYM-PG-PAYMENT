import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PwaInstallService } from '../../core/services/pwa-install.service';
import { ToastService } from '../../core/services/toast.service';
import { BrandLogoComponent } from '../../shared/brand-logo.component';
import { ThemeToggleComponent } from '../../shared/theme-toggle.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, BrandLogoComponent, ThemeToggleComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  readonly ownerMobileNumber = '6300675014';
  readonly whatsappNumber = `91${this.ownerMobileNumber}`;
  mobileMenuOpen = false;

  /** PWA install — exposed to the template. The iOS instructions overlay
   * is rendered globally in `AppComponent`, so we don't need to wire it
   * up here. */
  private readonly pwa = inject(PwaInstallService);
  private readonly toast = inject(ToastService);
  readonly canInstall = this.pwa.canInstall;
  readonly isInstalled = this.pwa.isInstalled;
  readonly isIosSafari = this.pwa.isIosSafari;
  /** Whether to render the install CTA at all (Chromium prompt OR iOS guidance). */
  readonly showInstallCta = computed(
    () => !this.isInstalled() && (this.canInstall() || this.isIosSafari()),
  );

  async installApp(): Promise<void> {
    this.mobileMenuOpen = false;
    const outcome = await this.pwa.promptInstall();
    if (outcome === 'accepted') {
      this.toast.success('App installed. Open it from your home screen any time.');
    } else if (outcome === 'unavailable' && !this.isIosSafari()) {
      this.toast.success('Open your browser menu → "Install app" / "Add to Home Screen".');
    }
  }

  readonly quickBenefits = [
    { icon: 'fa-indian-rupee-sign', title: 'Track Payments & Dues Easily' },
    { icon: 'fa-bed', title: 'Manage Rooms & Beds' },
    { icon: 'fa-users', title: 'Handle All Members in One Place' },
    { icon: 'fa-chart-line', title: 'Monitor Earnings & Growth' },
  ];

  readonly groupedFeatures = [
    {
      id: 'payments',
      icon: 'fa-wallet',
      title: 'Payments & Dues Management',
      summary: 'Never miss a payment — track every rupee with full clarity.',
      points: [
        'Track pending, overdue, and due-soon payments',
        'Support for partial payments',
        'Payment history per member',
        'Multiple payment methods (cash / UPI / card)',
        'Export payment reports',
      ],
    },
    {
      id: 'rooms',
      icon: 'fa-building',
      title: 'Room & Bed Management',
      summary: 'Know exactly which beds are filled and available at any time.',
      points: [
        'Create floors, rooms, and beds',
        'Visual bed occupancy (occupied vs vacant)',
        'Assign beds to members easily',
        'Prevent double booking',
        'Track available beds instantly',
      ],
    },
    {
      id: 'members',
      icon: 'fa-id-card',
      title: 'Member Management',
      summary: 'Manage all your tenants with complete records in one place.',
      points: [
        'Add, edit, delete members',
        'View active/inactive members',
        'Member profile with full payment history',
        'Search, filter, and sort members',
        'Quick contact actions (call / WhatsApp)',
      ],
    },
    {
      id: 'insights',
      icon: 'fa-chart-pie',
      title: 'Dashboard & Insights',
      summary: 'Get complete visibility of your PG performance instantly.',
      points: [
        'Real-time dashboard (members, dues, earnings)',
        'Monthly earnings tracking',
        'Due today / overdue insights',
        'Reports and export options',
      ],
    },
    {
      id: 'import',
      icon: 'fa-file-import',
      title: 'Bulk Import & Setup',
      summary: 'Add all your tenants in minutes — no manual work.',
      points: [
        'Upload members via Excel/CSV',
        'Auto validation and error handling',
        'Seat assignment validation',
      ],
    },
    {
      id: 'reminders',
      icon: 'fa-bell',
      title: 'Smart Reminders & Actions',
      summary: 'Reduce late payments with instant reminders.',
      points: [
        'Send payment reminders instantly',
        'WhatsApp / call integration',
        'Quick actions for daily tasks',
      ],
    },
    {
      id: 'security',
      icon: 'fa-shield-halved',
      title: 'Secure Access & Control',
      summary: 'Your data is safe and accessible only to you.',
      points: [
        'Secure login (email/mobile)',
        'Account status handling',
        'Protected owner access',
      ],
    },
  ];

  demoForm = {
    name: '',
    address: '',
    businessType: 'pg',
    email: '',
    mobile: '',
  };

  private readonly emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
  private readonly mobileRegex = /^\d{10}$/;

  private cleanValue(value: string): string {
    return value.trim();
  }

  private normalizedMobile(value: string): string {
    return value.replace(/\D/g, '');
  }

  isDemoFormValid(): boolean {
    const name = this.cleanValue(this.demoForm.name);
    const address = this.cleanValue(this.demoForm.address);
    const email = this.cleanValue(this.demoForm.email);
    const mobile = this.normalizedMobile(this.demoForm.mobile);
    return !!name && !!address && this.emailRegex.test(email) && this.mobileRegex.test(mobile);
  }

  scrollTo(sectionId: string): void {
    this.mobileMenuOpen = false;
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  openWhatsAppGeneral(): void {
    const text = encodeURIComponent('Hi, I want to use this application. Please share more details.');
    window.open(`https://wa.me/${this.whatsappNumber}?text=${text}`, '_blank', 'noopener,noreferrer');
  }

  sendDemoRequest(form?: NgForm): void {
    if (!this.isDemoFormValid()) {
      form?.control.markAllAsTouched();
      return;
    }

    const normalizedMobile = this.normalizedMobile(this.demoForm.mobile);
    const details = [
      'Hi, I need one demo.',
      '',
      `Name: ${this.cleanValue(this.demoForm.name)}`,
      `Address: ${this.cleanValue(this.demoForm.address)}`,
      `Business Type: ${this.demoForm.businessType}`,
      `Email: ${this.cleanValue(this.demoForm.email)}`,
      `Mobile: ${normalizedMobile}`,
    ].join('\n');

    const text = encodeURIComponent(details);
    window.open(`https://wa.me/${this.whatsappNumber}?text=${text}`, '_blank', 'noopener,noreferrer');
  }
}
