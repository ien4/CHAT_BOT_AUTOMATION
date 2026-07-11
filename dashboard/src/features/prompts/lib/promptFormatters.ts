import type { PromptTab, PromptTemplate } from '../types';

export const TABS: PromptTab[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'identity', label: '🧠 Bot Identity' },
  { key: 'guardrails', label: '🛡️ Guardrails' },
  { key: 'chatbot', label: '🤖 Chatbot' },
  { key: 'email_b2b', label: '📧 Email B2B' },
  { key: 'zalo_b2b', label: '💬 Zalo B2B' },
];

export const CHATBOT_INTENTS = ['company_info', 'service_inquiry', 'content_package', 'campaign', 'general', 'fallback'];

export function filterPrompts(templates: PromptTemplate[], activeTab: string) {
  if (activeTab === 'all') return templates;
  if (activeTab === 'identity') return templates.filter(t => t.layer === 'identity');
  if (activeTab === 'guardrails') return templates.filter(t => t.layer === 'guardrails');
  if (activeTab === 'chatbot') return templates.filter(t => CHATBOT_INTENTS.includes(t.intentType) && t.layer === 'intent');
  return templates.filter(t => t.intentType === activeTab && t.layer === 'intent');
}

export function getDefaultLayer(tab: string) {
  if (tab === 'identity') return 'identity';
  if (tab === 'guardrails') return 'guardrails';
  return 'intent';
}

export function getDefaultIntentType(tab: string) {
  if (tab === 'email_b2b') return 'email_b2b';
  if (tab === 'zalo_b2b') return 'zalo_b2b';
  return 'general';
}

export function intentLabel(t: string) {
  const map: Record<string, string> = {
    identity: '🧠 Bot Identity',
    guardrails: '🛡️ Guardrails',
    company_info: 'Thông tin công ty',
    service_inquiry: 'Dịch vụ',
    content_package: 'Gói nội dung',
    campaign: 'Chiến dịch',
    general: 'Chung',
    fallback: 'Fallback',
    email_b2b: 'Email B2B',
    zalo_b2b: 'Zalo B2B',
  };
  return map[t] || t;
}

export function getPromptTabCount(templates: PromptTemplate[], key: string) {
  return filterPrompts(templates, key).length;
}
