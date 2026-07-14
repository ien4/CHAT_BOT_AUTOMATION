export interface QuickReplyItem {
  title: string;
  payload: string;
}

export interface QuickReplyMenu {
  id: string;
  intentType: string;
  pageId?: string | null;
  items: QuickReplyItem[];
  isActive: boolean;
}

export interface QuickReplyFormState {
  intentType: string;
  pageId: string;
  items: QuickReplyItem[];
  isActive: boolean;
}

export interface QuickReplyIntentType {
  value: string;
  label: string;
}
