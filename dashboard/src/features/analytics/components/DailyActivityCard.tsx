import type { Analytics } from '../types';

// Tin nhắn theo ngày (full-width) — giữ nguyên JSX/className/text, kể cả lg:col-span-2.
export function DailyActivityCard({ daily }: { daily: Analytics['messages']['daily'] }) {
  return (
    <div className="card lg:col-span-2">
      <h2 className="text-lg font-semibold mb-4">📈 Tin nhắn theo ngày</h2>
      {daily.length > 0 ? (
        <div className="overflow-x-auto">
          <div className="flex items-end gap-2 h-40 min-w-[400px]">
            {daily.map(day => {
              const maxVal = Math.max(...daily.map(d => d.total), 1);
              const height = (day.total / maxVal) * 100;
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center min-w-[30px]">
                  <div className="relative w-full flex flex-col items-center justify-end h-full">
                    <div
                      className="w-full bg-blue-500 rounded-t"
                      style={{ height: `${height}%` }}
                      title={`${day.date}: ${day.total} tin`}
                    />
                  </div>
                  <span className="text-[8px] text-gray-400 mt-0.5 truncate max-w-full">
                    {new Date(day.date).toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-gray-400 text-sm text-center py-8">Chưa có dữ liệu</p>
      )}
    </div>
  );
}
