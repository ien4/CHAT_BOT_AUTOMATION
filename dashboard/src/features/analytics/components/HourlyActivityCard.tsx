import type { Analytics } from '../types';

// Hoạt động theo giờ — giữ nguyên JSX/className/text.
export function HourlyActivityCard({ hourly }: { hourly: Analytics['messages']['hourly'] }) {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">🕐 Hoạt động theo giờ</h2>
      {hourly.length > 0 ? (
        <div className="flex items-end gap-1 h-32">
          {Array.from({ length: 24 }, (_, hour) => {
            const found = hourly.find(h => h.hour === hour);
            const count = found?.count || 0;
            const maxCount = Math.max(...hourly.map(h => h.count), 1);
            const isPeak = count === maxCount;
            return (
              <div key={hour} className="flex-1 flex flex-col items-center">
                <div
                  className={`w-full rounded-t ${isPeak ? 'bg-yellow-500' : 'bg-blue-400'}`}
                  style={{ height: `${(count / maxCount) * 100}%` }}
                  title={`${hour}:00 - ${count} tin`}
                />
                {hour % 4 === 0 && <span className="text-[8px] text-gray-400 mt-0.5">{hour}h</span>}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-gray-400 text-sm text-center py-8">Chưa có dữ liệu</p>
      )}
    </div>
  );
}
