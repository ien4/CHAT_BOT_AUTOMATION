import { Menu as MenuIcon } from 'lucide-react';

export function QuickRepliesEmptyState() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
      <MenuIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
      Chưa có menu nào. Bấm "Tạo menu mới" để định nghĩa Quick Reply cho từng intent.
    </div>
  );
}
