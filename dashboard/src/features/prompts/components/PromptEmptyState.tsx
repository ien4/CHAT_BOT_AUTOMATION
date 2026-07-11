import { FileText } from 'lucide-react';

export function PromptEmptyState({ activeTab }: { activeTab: string }) {
  return (
    <div className="card text-center py-10 text-gray-400">
      <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
      <p>Chưa có prompt nào</p>
      {activeTab === 'guardrails' && (
        <p className="text-xs mt-2 max-w-sm mx-auto">
          Guardrails là các quy tắc/giới hạn được append vào cuối system prompt. Tenant không có guardrails riêng sẽ dùng guardrails global.
        </p>
      )}
    </div>
  );
}
