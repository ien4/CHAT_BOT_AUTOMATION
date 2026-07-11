export interface Staff {
  id: string;
  name: string;
  telegramId: string;
  telegramChatId: string;
  isActive: boolean;
  isOnDuty: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StaffFormPayload {
  name: string;
  telegramChatId: string;
}
