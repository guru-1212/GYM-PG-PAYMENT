import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { BrandLogoComponent } from '../../shared/brand-logo.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe, BrandLogoComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  features = [
    {
      icon: '👥',
      title: 'Member Management',
      description: 'Track members, subscriptions, and payment history seamlessly',
    },
    {
      icon: '💰',
      title: 'Payment Tracking',
      description: 'Monitor payments, generate invoices, and manage dues',
    },
    {
      icon: '🏠',
      title: 'Room Management',
      description: 'Manage PG rooms, floors, and bed availability',
    },
    {
      icon: '📊',
      title: 'Analytics & Reports',
      description: 'Comprehensive insights into your business performance',
    },
    {
      icon: '🔐',
      title: 'Admin Dashboard',
      description: 'Manage multiple gyms/PGs from a centralized admin panel',
    },
    {
      icon: '📱',
      title: 'Responsive Design',
      description: 'Access your business from any device, anytime',
    },
  ];

  plans = [
    {
      name: 'Startup',
      description: 'Perfect for small gyms',
      price: '499',
      featured: false,
      features: [
        'Up to 100 members',
        'Payment tracking',
        'Basic reports',
        'Email support',
      ],
    },
    {
      name: 'Professional',
      description: 'For growing businesses',
      price: '999',
      featured: true,
      features: [
        'Up to 500 members',
        'Advanced analytics',
        'Room management',
        'Priority support',
        'Custom branding',
      ],
    },
    {
      name: 'Enterprise',
      description: 'For large operations',
      price: '2499',
      featured: false,
      features: [
        'Unlimited members',
        'Multi-location',
        'API access',
        '24/7 support',
        'Custom integration',
      ],
    },
  ];
}
