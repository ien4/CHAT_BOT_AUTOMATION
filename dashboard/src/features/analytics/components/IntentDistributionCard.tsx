import type { Analytics } from '../types';
import { INTENT_LABELS, INTENT_COLORS } from '../lib/formatters';

// Phân bố intent — giữ nguyên JSX/className/text.
export function IntentDistributionCard({ intents }: { intents: Analytics['intents'] }) {
  const totalIntents = intents.reduce((sum, i) => sum + i.count, 0);

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">🎯 Intent Distribution</h2>
      <div className="space-y-3">
        {intents.length === 0 ? (
          <p className="text-gray-400 text-sm">Chưa có dữ liệu intent</p>
        ) : (
          intents.map(item => {
            const pct = totalIntents > 0 ? (item.count / totalIntents * 100) : 0;
            return (
              <div key={item.intent}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{INTENT_LABELS[item.intent] || item.intent}</span>
                  <span className="text-gray-500">{item.count} ({pct.toFixed(1)}%)</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${INTENT_COLORS[item.intent] || 'bg-gray-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
