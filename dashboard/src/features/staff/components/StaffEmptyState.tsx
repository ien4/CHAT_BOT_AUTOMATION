import { Users } from 'lucide-react';

export function StaffEmptyState() {
  return (
    <div className="card text-center py-10 text-gray-400">
      <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
      <p>Chưa có nhân viên nào. Thêm người đầu tiên!</p>
    </div>
  );
}
