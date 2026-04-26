import { Injectable, inject } from '@angular/core';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { Member } from '../models/member.model';
import { Payment } from '../models/payment.model';
import { AuthService } from './auth.service';
import { FirebaseAppService } from './firebase-app.service';
import { jsPDF } from 'jspdf';

/** Firestore collection paths for receipt links. */
const RECEIPT_TOKENS_COLLECTION = 'memberReceiptLinks';

/** Link expiry — 7 days for receipts. */
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ReceiptLinkData {
  memberId: string;
  ownerId: string;
  paymentId: string;
  receiptNumber: string;
  receiptData: {
    memberName: string;
    amount: number;
    paymentDate: Date;
    paymentMethod: string;
    businessName: string;
    monthText: string;
  };
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

export interface ReceiptPublicView {
  token: string;
  linkData: ReceiptLinkData;
  member: Pick<Member, 'firstName' | 'lastName' | 'mobile'>;
  payment: Pick<Payment, 'amount' | 'date' | 'method'>;
  receiptNumber: string;
  businessName: string;
}

@Injectable({ providedIn: 'root' })
export class MemberReceiptService {
  private readonly fb = inject(FirebaseAppService);
  private readonly auth = inject(AuthService);

  /* ------------------------- helpers ------------------------- */

  private tokenDocRef(token: string) {
    return doc(this.fb.db, RECEIPT_TOKENS_COLLECTION, token);
  }

  /** Generate a URL-safe random token (~32 chars). */
  private generateToken(): string {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    let s = '';
    for (let i = 0; i < bytes.length; i += 1) {
      s += bytes[i].toString(16).padStart(2, '0');
    }
    return s;
  }

  /** Public link the owner shares with the member. */
  buildShareUrl(token: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/member-receipt/${token}`;
  }

  /* ------------------------- owner side ------------------------- */

  /**
   * Generate a receipt link for a member's payment receipt.
   */
  async generateReceiptLink(
    member: Member,
    payment: Payment,
    receiptNumber: string
  ): Promise<{ token: string; url: string; expiresAt: Date }> {
    const owner = this.auth.profile();
    if (!owner || owner.role !== 'owner' || owner.status !== 'approved') {
      throw new Error('Only approved owners can generate receipt links.');
    }
    if (member.ownerId !== owner.ownerId) {
      throw new Error('You can only share links for your own members.');
    }

    const token = this.generateToken();
    const now = Date.now();
    const expiresAt = new Date(now + TOKEN_TTL_MS);

    const paymentDate = payment.date?.toDate() || new Date();
    const monthText = paymentDate.toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    });

    const linkData: ReceiptLinkData = {
      memberId: member.memberId,
      ownerId: owner.ownerId,
      paymentId: payment.paymentId || '',
      receiptNumber,
      receiptData: {
        memberName: `${member.firstName} ${member.lastName || ''}`.trim(),
        amount: payment.amount || 0,
        paymentDate,
        paymentMethod: payment.method || 'cash',
        businessName: owner.businessName || owner.name || 'PayBook',
        monthText,
      },
      createdAt: Timestamp.fromDate(new Date()),
      expiresAt: Timestamp.fromDate(expiresAt),
    };

    await setDoc(this.tokenDocRef(token), linkData);

    return { token, url: this.buildShareUrl(token), expiresAt };
  }

  /* ------------------------- public-side reads ------------------------- */

  /** Read the public token doc; throws if not found. */
  async readToken(token: string): Promise<ReceiptLinkData> {
    const snap = await getDoc(this.tokenDocRef(token));
    if (!snap.exists()) throw new Error('RECEIPT_LINK_NOT_FOUND');
    const data = snap.data() as ReceiptLinkData;
    
    // Check if link is expired
    if (data.expiresAt.toDate().getTime() <= Date.now()) {
      throw new Error('RECEIPT_LINK_EXPIRED');
    }

    return data;
  }

  /**
   * Generate the receipt PDF for download.
   */
  async generateReceiptPDF(linkData: ReceiptLinkData): Promise<Blob> {
    const { receiptData } = linkData;
    
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 12;

    // Header background
    doc.setFillColor(33, 37, 41);
    doc.rect(8, 8, pageW - 16, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text('PAYMENT RECEIPT', margin, 23);
    doc.setFontSize(11);
    doc.text(receiptData.businessName.toUpperCase(), pageW - margin, 23, { align: 'right' });

    // Receipt meta
    doc.setTextColor(33, 37, 41);
    doc.setFontSize(10);
    doc.text(`Receipt No: ${linkData.receiptNumber}`, margin, 42);
    doc.text(`Date: ${receiptData.paymentDate.toLocaleDateString('en-IN')}`, pageW - margin, 42, { align: 'right' });

    // Member info box
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, 52, pageW - margin * 2, 30, 'F');
    doc.setTextColor(33, 37, 41);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Member Information', margin + 4, 62);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Name: ${receiptData.memberName}`, margin + 4, 72);
    doc.text(`Month: ${receiptData.monthText}`, margin + 4, 78);

    // Payment details box
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, 88, pageW - margin * 2, 40, 'F');
    doc.setTextColor(33, 37, 41);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Payment Details', margin + 4, 98);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Amount: ₹${receiptData.amount.toLocaleString('en-IN')}`, margin + 4, 108);
    doc.text(`Payment Method: ${receiptData.paymentMethod.charAt(0).toUpperCase() + receiptData.paymentMethod.slice(1)}`, margin + 4, 114);
    doc.text(`Payment Date: ${receiptData.paymentDate.toLocaleDateString('en-IN')}`, margin + 4, 120);

    // Footer
    doc.setTextColor(33, 37, 41);
    doc.setFontSize(10);
    doc.text('Thank you for your payment!', margin + 4, 160);
    doc.setTextColor(75, 85, 99);
    doc.setFontSize(9);
    doc.text('This is a system-generated receipt. Please keep it for your records.', margin + 4, 167);
    doc.text(`${receiptData.businessName}`, pageW - margin - 4, 167, { align: 'right' });

    return new Blob([doc.output('blob')], { type: 'application/pdf' });
  }

  /** True when expiresAt is in the past. */
  isLinkValid(linkData: ReceiptLinkData): boolean {
    return linkData.expiresAt.toDate().getTime() > Date.now();
  }
}
