import { Injectable, inject } from '@angular/core';
import {
  doc,
  getDoc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
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
    paymentDate: Date | Timestamp;
    paymentMethod: string;
    businessName: string;
    monthText: string;
    pendingAmount?: number;
    pendingPaidAmount?: number;
    pendingMonthText?: string;
    pendingCarryForwardText?: string;
    /** When set, PDF header/total labels match a split tenant receipt (pending vs rent). */
    receiptKind?: 'combined' | 'pending_balance' | 'rent';
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

type ReceiptMemberSource = Pick<
  Member,
  'memberId' | 'ownerId' | 'firstName' | 'lastName' | 'mobile' | 'amount' | 'pendingAmount'
> &
  Partial<Pick<Member, 'dueDate'>> & {
    pendingBeforeAmount?: number;
    pendingAfterAmount?: number;
  };

@Injectable({ providedIn: 'root' })
export class MemberReceiptService {
  private readonly fb = inject(FirebaseAppService);
  private readonly auth = inject(AuthService);

  /* ------------------------- helpers ------------------------- */

  private tokenDocRef(token: string) {
    return doc(this.fb.db, RECEIPT_TOKENS_COLLECTION, token);
  }

  private toDate(value: unknown): Date {
    if (value instanceof Date) return value;
    const maybeTs = value as { toDate?: () => Date };
    if (maybeTs && typeof maybeTs.toDate === 'function') return maybeTs.toDate();
    return new Date();
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
    member: ReceiptMemberSource,
    payment: Payment,
    receiptNumber: string
  ): Promise<{ token: string; url: string; expiresAt: Date }> {
    const profile = this.auth.profile();
    if (!profile) {
      throw new Error('Please sign in again.');
    }
    const canShareAsOwner = profile.role === 'owner' && profile.status === 'approved';
    const canShareAsSupervisor =
      profile.role === 'supervisor' && this.auth.hasPermission('canRecordPayments');
    if (!canShareAsOwner && !canShareAsSupervisor) {
      throw new Error('You do not have permission to generate receipt links.');
    }
    const ownerId = profile.ownerId;
    if (!ownerId || member.ownerId !== ownerId) {
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
    const pendingBefore = Math.max(
      0,
      Number(member.pendingBeforeAmount ?? member.pendingAmount) || 0,
    );
    const pendingAfter = Math.max(0, Number(member.pendingAfterAmount ?? 0) || 0);
    const pendingPaidAmount = Math.min(Math.max(0, Number(payment.amount) || 0), pendingBefore);
    const pendingMonthDate = member.dueDate ? this.toDate(member.dueDate) : null;
    const pendingMonthText =
      pendingPaidAmount > 0
        ? (pendingMonthDate || paymentDate).toLocaleDateString('en-IN', {
            month: 'long',
            year: 'numeric',
          })
        : undefined;

    const receiptData: ReceiptLinkData['receiptData'] = {
      memberName: `${member.firstName} ${member.lastName || ''}`.trim(),
      amount: payment.amount || 0,
      paymentDate,
      paymentMethod: payment.method || 'cash',
      businessName: profile.businessName || profile.name || 'PayBook',
      monthText,
      pendingAmount: pendingAfter,
      ...(pendingPaidAmount > 0 ? { pendingPaidAmount } : {}),
      ...(pendingPaidAmount > 0 && pendingMonthText ? { pendingMonthText } : {}),
      ...(pendingAfter > 0
        ? {
            pendingCarryForwardText: `Pending amount INR ${pendingAfter.toLocaleString(
              'en-IN',
            )} will be charged in next cycle.`,
          }
        : {}),
    };

    const linkData: ReceiptLinkData = {
      memberId: member.memberId,
      ownerId,
      paymentId: payment.paymentId || '',
      receiptNumber,
      receiptData,
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
    const raw = snap.data() as ReceiptLinkData;
    const data: ReceiptLinkData = {
      ...raw,
      receiptData: {
        ...raw.receiptData,
        paymentDate: this.toDate(raw.receiptData?.paymentDate),
      },
    };
    
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
    const paymentDate = this.toDate(receiptData.paymentDate);
    
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const contentW = pageW - margin * 2;
    const amountText = `INR ${Math.max(0, Number(receiptData.amount) || 0).toLocaleString('en-IN')}`;
    const pendingAmount = Math.max(0, Number(receiptData.pendingAmount) || 0);
    const pendingPaidAmount = Math.max(0, Number(receiptData.pendingPaidAmount) || 0);
    const pendingMonthText = receiptData.pendingMonthText?.trim() || '';
    const paymentMethod =
      receiptData.paymentMethod.charAt(0).toUpperCase() + receiptData.paymentMethod.slice(1).toLowerCase();
    const receiptKind = receiptData.receiptKind || 'combined';
    const headerTitle =
      receiptKind === 'pending_balance'
        ? 'PENDING BALANCE RECEIPT'
        : receiptKind === 'rent'
          ? 'RENT PAYMENT RECEIPT'
          : 'PAYMENT RECEIPT';
    const totalLabel =
      receiptKind === 'pending_balance'
        ? 'PENDING BALANCE PAID'
        : receiptKind === 'rent'
          ? 'RENT AMOUNT PAID'
          : 'TOTAL AMOUNT PAID';

    // Outer border
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.6);
    doc.roundedRect(8, 8, pageW - 16, 281, 3, 3);

    // Header
    doc.setFillColor(15, 23, 42);
    doc.rect(8, 8, pageW - 16, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text(headerTitle, margin, 25);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(String(receiptData.businessName || 'PayBook').toUpperCase(), pageW - margin, 25, { align: 'right' });

    // Receipt metadata row
    const metaY = 45;
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('RECEIPT NO', margin, metaY);
    doc.text('ISSUE DATE', margin + 72, metaY);
    doc.text('PAYMENT ID', margin + 128, metaY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.text(linkData.receiptNumber, margin, metaY + 6);
    doc.text(paymentDate.toLocaleDateString('en-IN'), margin + 72, metaY + 6);
    doc.text(linkData.paymentId || 'N/A', margin + 128, metaY + 6);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, metaY + 11, margin + contentW, metaY + 11);

    // Bill to
    const billY = 62;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, billY, contentW, 31, 2, 2, 'F');
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('BILL TO', margin + 4, billY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Member Name: ${receiptData.memberName}`, margin + 4, billY + 14);
    // doc.text(`Member ID: ${linkData.memberId}`, margin + 4, billY + 20);
    doc.text(`Billing Month: ${receiptData.monthText}`, margin + 4, billY + 26);

    // Payment details block
    const payY = 100;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, payY, contentW, 66, 2, 2, 'F');
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('PAYMENT DETAILS', margin + 4, payY + 8);
    doc.setDrawColor(203, 213, 225);
    doc.line(margin + 4, payY + 11, margin + contentW - 4, payY + 11);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text('Payment Method', margin + 4, payY + 20);
    doc.text('Payment Date', margin + 4, payY + 28);
    doc.text('Pending Amount', margin + 4, payY + 36);
    doc.text('Generated On', margin + 4, payY + 52);

    doc.setTextColor(15, 23, 42);
    doc.text(paymentMethod, margin + 54, payY + 20);
    doc.text(paymentDate.toLocaleDateString('en-IN'), margin + 54, payY + 28);
    doc.text(`INR ${pendingAmount.toLocaleString('en-IN')}`, margin + 54, payY + 36);
    doc.text(new Date().toLocaleString('en-IN'), margin + 54, payY + 52);

    // Old pending highlight (only when previous-cycle pending is cleared in this payment)
    const pendingY = 166;
    if (pendingPaidAmount > 0) {
      doc.setFillColor(254, 240, 138);
      doc.roundedRect(margin, pendingY, contentW, 20, 2, 2, 'F');
      doc.setTextColor(113, 63, 18);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(
        `OLD PENDING PAID (${pendingMonthText || receiptData.monthText})`,
        margin + 5,
        pendingY + 8,
      );
      doc.setFontSize(13);
      doc.text(
        `INR ${pendingPaidAmount.toLocaleString('en-IN')}`,
        margin + contentW - 5,
        pendingY + 14,
        { align: 'right' },
      );
    }

    // Pending carry-forward note (when pending remains after payment)
    const carryY = pendingPaidAmount > 0 ? 192 : 166;
    if (pendingAmount > 0) {
      doc.setFillColor(255, 237, 213);
      doc.roundedRect(margin, carryY, contentW, 16, 2, 2, 'F');
      doc.setTextColor(154, 52, 18);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(
        receiptData.pendingCarryForwardText ||
          `Pending amount INR ${pendingAmount.toLocaleString('en-IN')} will be charged in next cycle.`,
        margin + 4,
        carryY + 10,
      );
    }

    // Total amount highlight
    const totalY = pendingPaidAmount > 0 ? (pendingAmount > 0 ? 212 : 192) : (pendingAmount > 0 ? 186 : 166);
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(margin, totalY, contentW, 24, 2, 2, 'F');
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(10);
    doc.text(totalLabel, margin + 5, totalY + 9);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(amountText, margin + contentW - 5, totalY + 16, { align: 'right' });

    // Footer notes
    const noteY = pendingPaidAmount > 0 ? (pendingAmount > 0 ? 248 : 230) : (pendingAmount > 0 ? 224 : 205);
    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Notes', margin, noteY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('1. This is a system-generated receipt and does not require a physical signature.', margin, noteY + 7);
    doc.text('2. Please keep this receipt for your records and verification purposes.', margin, noteY + 13);
    doc.text('3. For corrections, contact your property admin with Receipt No and Payment ID.', margin, noteY + 19);

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, 272, margin + contentW, 272);
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8.5);
    doc.text(`Issued by ${receiptData.businessName}`, margin, 278);
    doc.text('Powered by PayBook', margin + contentW, 278, { align: 'right' });

    return new Blob([doc.output('blob')], { type: 'application/pdf' });
  }

  /** True when expiresAt is in the past. */
  isLinkValid(linkData: ReceiptLinkData): boolean {
    return linkData.expiresAt.toDate().getTime() > Date.now();
  }
}
