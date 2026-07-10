import type { Analytics } from '../types';

// Trạng thái handoff — giữ nguyên JSX/className/text.
export function HandoffStatusCard({ handoff }: { handoff: Analytics['handoff'] }) {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">🔀 Handoff Status</h2>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-yellow-50 p-3 rounded-lg">
          <p className="text-2xl font-bold text-yellow-600">{handoff.pending}</p>
          <p className="text-xs text-yellow-700">Chờ nhận</p>
        </div>
        <div className="bg-green-50 p-3 rounded-lg">
          <p className="text-2xl font-bold text-green-600">{handoff.active}</p>
          <p className="text-xs text-green-700">Đang hỗ trợ</p>
        </div>
        <div className="bg-blue-50 p-3 rounded-lg">
          <p className="text-2xl font-bold text-blue-600">{handoff.resolved}</p>
          <p className="text-xs text-blue-700">Đã kết thúc</p>
        </div>
      </div>
    </div>
  );
}
