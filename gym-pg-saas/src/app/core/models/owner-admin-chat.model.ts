import { Timestamp } from 'firebase/firestore';

export type ChatSenderRole = 'admin' | 'owner';

export interface OwnerAdminChatMessage {
  id: string;
  chatId: string;
  ownerId: string;
  senderRole: ChatSenderRole;
  senderId: string;
  senderName?: string;
  text: string;
  timestamp: Timestamp | null;
  readByAdmin: boolean;
  readByOwner: boolean;
}