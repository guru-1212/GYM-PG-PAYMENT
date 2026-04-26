import { DatePipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MemberReceiptService, ReceiptLinkData } from '../../core/services/member-receipt.service';

@Component({
  selector: 'app-member-receipt',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './member-receipt.component.html',
  styles: [`
    .receipt-container {
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    
    .receipt-card {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-radius: 20px;
      padding: 40px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
      max-width: 500px;
      width: 100%;
      text-align: center;
    }
    
    .icon-success {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      box-shadow: 0 10px 25px rgba(16, 185, 129, 0.3);
    }
    
    .download-btn {
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      color: white;
      border: none;
      padding: 16px 32px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 10px 25px rgba(59, 130, 246, 0.3);
      display: inline-flex;
      align-items: center;
      gap: 12px;
    }
    
    .download-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 15px 35px rgba(59, 130, 246, 0.4);
    }
    
    .download-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    
    .loading-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid #ffffff;
      border-top: 2px solid transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .receipt-info {
      background: rgba(59, 130, 246, 0.1);
      border-radius: 12px;
      padding: 20px;
      margin: 24px 0;
    }
    
    .receipt-info h3 {
      color: #1e40af;
      margin: 0 0 12px 0;
      font-size: 18px;
    }
    
    .receipt-info p {
      color: #64748b;
      margin: 4px 0;
      font-size: 14px;
    }
  `]
})
export class MemberReceiptComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly receiptService = inject(MemberReceiptService);

  token: string | null = null;
  receiptData: ReceiptLinkData | null = null;
  loading = true;
  error: string | null = null;
  downloading = false;

  // Convert Firebase Timestamp to JavaScript Date for template
  get paymentDate(): Date | null {
    const raw = this.receiptData?.receiptData?.paymentDate;
    if (!raw) return null;
    const maybeTs = raw as { toDate?: () => Date };
    if (typeof maybeTs.toDate === 'function') return maybeTs.toDate();
    return raw instanceof Date ? raw : null;
  }

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token');
    if (this.token) {
      this.loadReceiptData();
    } else {
      this.error = 'Invalid receipt link';
      this.loading = false;
    }
  }

  async loadReceiptData(): Promise<void> {
    try {
      if (!this.token) throw new Error('No token provided');
      
      this.receiptData = await this.receiptService.readToken(this.token);
      this.loading = false;
    } catch (err) {
      console.error('Error loading receipt:', err);
      if (err instanceof Error) {
        if (err.message === 'RECEIPT_LINK_NOT_FOUND') {
          this.error = 'Receipt link not found. Please contact your gym owner.';
        } else if (err.message === 'RECEIPT_LINK_EXPIRED') {
          this.error = 'This receipt link has expired. Please contact your gym owner for a new link.';
        } else {
          this.error = 'Unable to load receipt. Please try again later.';
        }
      } else {
        this.error = 'An unexpected error occurred.';
      }
      this.loading = false;
    }
  }

  async downloadReceipt(): Promise<void> {
    if (!this.receiptData || this.downloading) return;

    this.downloading = true;
    try {
      const pdfBlob = await this.receiptService.generateReceiptPDF(this.receiptData);
      
      // Create download link
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt-${this.receiptData.receiptNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading receipt:', err);
      this.error = 'Failed to download receipt. Please try again.';
    } finally {
      this.downloading = false;
    }
  }
}
