import type { QuickReplyIntentType } from '../types';

export const INTENT_TYPES: QuickReplyIntentType[] = [
  { value: 'general', label: '💬 General' },
  { value: 'company_info', label: '🏢 Company Info' },
  { value: 'service_inquiry', label: '🛠 Service Inquiry' },
  { value: 'content_package', label: '📦 Content Package' },
  { value: 'fallback', label: '❓ Fallback' },
];

export function getIntentTypeLabel(intentType: string) {
  return INTENT_TYPES.find(type => type.value === intentType)?.label || intentType;
}
