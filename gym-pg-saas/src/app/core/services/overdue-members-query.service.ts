import { Injectable, inject } from '@angular/core';
import { Member } from '../models/member.model';
import { MemberService } from './member.service';
import { 
  memberDueBucket, 
  timestampToDate, 
  overdueCalendarDays,
  coerceFirestoreDate 
} from '../utils/date.utils';

export interface OverdueMemberSummary {
  memberId: string;
  name: string;
  mobile: string;
  overdueDays: number;
  dueDate: Date;
  pendingAmount: number;
  roomNumber?: string;
  floorNumber?: string;
}

@Injectable({ providedIn: 'root' })
export class OverdueMembersQueryService {
  private readonly memberService = inject(MemberService);

  /**
   * Check if a message is asking about overdue members
   */
  isOverdueMembersQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase().trim();
    const overdueKeywords = [
      'overdue members',
      'overdue member',
      'who is overdue',
      'overdue payments',
      'pending payments',
      'members with due',
      'members overdue',
      'overdue list',
      'show overdue',
      'overdue members list'
    ];
    
    return overdueKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Get overdue members for an owner
   */
  async getOverdueMembers(ownerId: string): Promise<OverdueMemberSummary[]> {
    try {
      return new Promise((resolve, reject) => {
        this.memberService.members$(ownerId).subscribe({
          next: (members) => {
            const overdueMembers: OverdueMemberSummary[] = [];

            for (const member of members) {
              if (member.status !== 'active') continue;

              const dueDate = coerceFirestoreDate(member.dueDate as unknown) ?? timestampToDate(member.dueDate);
              if (!dueDate) continue;

              const bucket = memberDueBucket(dueDate, true);
              if (bucket === 'overdue') {
                const overdueDays = overdueCalendarDays(dueDate);
                
                overdueMembers.push({
                  memberId: member.memberId,
                  name: `${member.firstName} ${member.lastName || ''}`.trim(),
                  mobile: member.mobile || '',
                  overdueDays,
                  dueDate,
                  pendingAmount: member.pendingAmount || 0,
                  roomNumber: member.roomNumber,
                  floorNumber: member.floorNumber
                });
              }
            }

            // Sort by most overdue first
            overdueMembers.sort((a, b) => b.overdueDays - a.overdueDays);
            
            resolve(overdueMembers);
          },
          error: (error) => {
            console.error('Error fetching overdue members:', error);
            resolve([]);
          }
        });
      });
    } catch (error) {
      console.error('Error fetching overdue members:', error);
      return [];
    }
  }

  /**
   * Generate a chat response with overdue members list
   */
  generateOverdueMembersResponse(overdueMembers: OverdueMemberSummary[]): string {
    if (overdueMembers.length === 0) {
      return 'Good news! No members are currently overdue. 🎉';
    }

    let response = `Found ${overdueMembers.length} overdue member${overdueMembers.length === 1 ? '' : 's'}:\n\n`;
    
    overdueMembers.forEach((member, index) => {
      const roomInfo = member.roomNumber ? `Room ${member.floorNumber}${member.roomNumber}` : 'No Room';
      const pendingInfo = member.pendingAmount > 0 ? `₹${member.pendingAmount}` : '₹0';
      
      response += `**${member.name}**\n`;
      response += `📱 ${member.mobile} | 🏠 ${roomInfo}\n`;
      response += `⏰ ${member.overdueDays} day${member.overdueDays === 1 ? '' : 's'} overdue | 💰 Pending: ${pendingInfo}\n`;
      response += `� Due: ${member.dueDate.toLocaleDateString('en-IN')}\n\n`;
    });

    response += '💡 Click on any member name above to view their details in the members table with overdue filter applied.';
    
    return response;
  }

  /**
   * Generate professional card-based HTML response for overdue members
   */
  generateOverdueMembersCardResponse(overdueMembers: OverdueMemberSummary[]): string {
    if (overdueMembers.length === 0) {
      return '<div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border-radius: 12px; margin: 10px 0;"><div style="font-size: 24px; margin-bottom: 8px;">🎉</div><div style="font-weight: 600;">Good news!</div><div>No members are currently overdue</div></div>';
    }

    let html = `<div style="margin-bottom: 16px;">
      <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 12px 16px; border-radius: 8px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 20px;">⚠️</span>
        <span>Found ${overdueMembers.length} overdue member${overdueMembers.length === 1 ? '' : 's'}</span>
      </div>
    </div>`;
    
    overdueMembers.forEach((member, index) => {
      const roomInfo = member.roomNumber ? `${member.floorNumber}${member.roomNumber}` : 'N/A';
      const pendingInfo = member.pendingAmount > 0 ? `₹${member.pendingAmount}` : '₹0';
      const overdueColor = member.overdueDays > 7 ? '#dc2626' : member.overdueDays > 3 ? '#f59e0b' : '#3b82f6';
      
      html += `
        <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: all 0.2s;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
            <div style="flex: 1;">
              <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #1f2937;">
                <a href="/members?search=${encodeURIComponent(member.name)}&pay=overdue" onclick="window.open(this.href, '_self'); return false;" style="color: #3b82f6; text-decoration: none; cursor: pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${member.name}</a>
              </h3>
            </div>
            <div style="background: ${overdueColor}; color: white; padding: 4px 8px; border-radius: 20px; font-size: 12px; font-weight: 600; white-space: nowrap;">
              ${member.overdueDays} day${member.overdueDays === 1 ? '' : 's'} overdue
            </div>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 8px; color: #6b7280; font-size: 14px;">
              <span style="font-size: 16px;">📱</span>
              <span>${member.mobile}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; color: #6b7280; font-size: 14px;">
              <span style="font-size: 16px;">🏠</span>
              <span>Room ${roomInfo}</span>
            </div>
          </div>
          
          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid #f3f4f6;">
            <div style="display: flex; align-items: center; gap: 8px; color: #6b7280; font-size: 13px;">
              <span style="font-size: 14px;">📅</span>
              <span>Due: ${member.dueDate.toLocaleDateString('en-IN')}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; color: #6b7280; font-size: 13px;">
              <span style="font-size: 14px;">💰</span>
              <span>Pending: ${pendingInfo}</span>
            </div>
          </div>
        </div>
      `;
    });
    
    html += `
      <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 12px; margin-top: 16px; display: flex; align-items: center; gap: 8px; color: #0369a1; font-size: 14px;">
        <span style="font-size: 16px;">💡</span>
        <span>Click on any member name above to view their details in the members table with overdue filter applied.</span>
      </div>
    `;
    
    return html;
  }

  /**
   * Generate HTML response with clickable member names
   */
  generateOverdueMembersHtmlResponse(overdueMembers: OverdueMemberSummary[]): string {
    if (overdueMembers.length === 0) {
      return '<p>Good news! No members are currently overdue. 🎉</p>';
    }

    let html = `<p>Found ${overdueMembers.length} overdue member${overdueMembers.length === 1 ? '' : 's'}:</p>`;
    
    overdueMembers.forEach((member, index) => {
      const roomInfo = member.roomNumber ? ` (Room: ${member.floorNumber}${member.roomNumber})` : '';
      const pendingInfo = member.pendingAmount > 0 ? ` | Pending: ₹${member.pendingAmount}` : '';
      
      html += `<div style="margin: 8px 0; padding: 8px; border-left: 3px solid #ef4444; background-color: #fef2f2;">`;
      html += `<div style="font-weight: bold; margin-bottom: 4px;">`;
      html += `<a href="/members?search=${encodeURIComponent(member.name)}&pay=overdue" style="color: #1f2937; text-decoration: none; cursor: pointer;" onclick="window.open(this.href, '_self');">${member.name}</a>`;
      html += `${roomInfo}</div>`;
      html += `<div style="font-size: 12px; color: #6b7280;">`;
      html += `📱 ${member.mobile} | ⏰ Overdue by ${member.overdueDays} day${member.overdueDays === 1 ? '' : 's'}${pendingInfo} | 📅 Due: ${member.dueDate.toLocaleDateString('en-IN')}`;
      html += `</div></div>`;
    });
    
    return html;
  }
}
