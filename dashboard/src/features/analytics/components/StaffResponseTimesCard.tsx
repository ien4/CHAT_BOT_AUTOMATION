import type { Analytics } from '../types';
import { formatTime } from '../lib/formatters';

// Thời gian phản hồi staff — giữ nguyên JSX/className/text.
export function StaffResponseTimesCard({ handoff }: { handoff: Analytics['handoff'] }) {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-2">⏱ Staff Response Times</h2>
      <p className="text-xs text-gray-400 mb-4">Thời gian staff phản hồi (30 gần nhất)</p>
      <div className="text-center mb-4">
        <span className="text-3xl font-bold text-purple-600">{formatTime(handoff.avgResponseTimeSeconds)}</span>
        <span className="text-sm text-gray-500 ml-2">trung bình</span>
      </div>
      {handoff.staffResponseTimes.length > 0 ? (
        <div className="flex items-end gap-1 h-20">
          {handoff.staffResponseTimes.slice(0, 30).map((time, i) => {
            const maxTime = Math.max(...handoff.staffResponseTimes, 1);
            const isSlow = time > 60; // > 1 phút
            return (
              <div
                key={i}
                className={`flex-1 rounded-t ${isSlow ? 'bg-red-400' : 'bg-green-400'}`}
                style={{ height: `${(time / maxTime) * 100}%` }}
                title={`${time}s`}
              />
            );
          })}
        </div>
      ) : (
        <p className="text-gray-400 text-sm text-center">Chưa có dữ liệu</p>
      )}
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>Gần đây</span>
        <span>Cũ hơn</span>
      </div>
    </div>
  );
}
