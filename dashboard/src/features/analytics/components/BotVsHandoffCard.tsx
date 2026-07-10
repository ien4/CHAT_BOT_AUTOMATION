import type { Analytics } from '../types';
import { getHandoffRate } from '../lib/formatters';

// Biểu đồ Bot vs Handoff — giữ nguyên JSX/className/text.
export function BotVsHandoffCard({ conversations }: { conversations: Analytics['conversations'] }) {
  const handoffRate = getHandoffRate(conversations);

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">🤖 Bot vs 👤 Handoff</h2>
      <div className="flex items-end gap-4 h-40">
        <div className="flex-1 flex flex-col items-center">
          <div className="text-sm font-medium text-gray-600 mb-1">{conversations.botHandled}</div>
          <div
            className="w-full bg-blue-500 rounded-t-lg transition-all"
            style={{ height: `${Math.max(10, (conversations.botHandled / Math.max(1, conversations.botHandled + conversations.handoffHandled)) * 100)}%` }}
          />
          <div className="text-xs mt-2 font-medium">Bot xử lý</div>
        </div>
        <div className="flex-1 flex flex-col items-center">
          <div className="text-sm font-medium text-gray-600 mb-1">{conversations.handoffHandled}</div>
          <div
            className="w-full bg-green-500 rounded-t-lg transition-all"
            style={{ height: `${Math.max(10, (conversations.handoffHandled / Math.max(1, conversations.botHandled + conversations.handoffHandled)) * 100)}%` }}
          />
          <div className="text-xs mt-2 font-medium">Handoff</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 text-center text-sm">
        <div className="bg-blue-50 p-2 rounded">
          <span className="text-blue-700 font-medium">{conversations.botHandled}</span>
          <span className="text-blue-500"> cuộc ({100 - parseFloat(handoffRate)}%)</span>
        </div>
        <div className="bg-green-50 p-2 rounded">
          <span className="text-green-700 font-medium">{conversations.handoffHandled}</span>
          <span className="text-green-500"> cuộc ({handoffRate}%)</span>
        </div>
      </div>
    </div>
  );
}
