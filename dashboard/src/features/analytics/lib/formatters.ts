// Helper thuần trình bày cho analytics — chuyển nguyên trạng từ page cũ, không đổi behavior.
import type { Analytics } from '../types';

export const INTENT_LABELS: Record<string, string> = {
  company_info: '🏢 Thông tin CTY',
  service_inquiry: '🛠 Dịch vụ',
  content_package: '📦 Gói nội dung',
  general: '💬 Chung',
  fallback: '❓ Fallback',
  email_b2b: '📧 Email B2B',
  zalo_b2b: '💬 Zalo B2B',
};

export const INTENT_COLORS: Record<string, string> = {
  company_info: 'bg-blue-500',
  service_inquiry: 'bg-green-500',
  content_package: 'bg-purple-500',
  general: 'bg-gray-500',
  fallback: 'bg-red-500',
  email_b2b: 'bg-yellow-500',
  zalo_b2b: 'bg-teal-500',
};

export function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function getHandoffRate(conversations: Analytics['conversations']): string {
  return conversations.botHandled + conversations.handoffHandled > 0
    ? (conversations.handoffHandled / (conversations.botHandled + conversations.handoffHandled) * 100).toFixed(1)
    : '0';
}
