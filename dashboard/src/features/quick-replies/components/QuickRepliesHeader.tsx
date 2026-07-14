'use client';

import { Plus } from 'lucide-react';

export function QuickRepliesHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold">⚡ Quick Reply Menus</h1>
        <p className="text-gray-500 mt-1">Cấu hình nút Quick Reply cố định cho từng intent. Khi có menu fixed, bot sẽ dùng menu này thay vì AI-generate.</p>
      </div>
      <button onClick={onCreate} className="btn btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Tạo menu mới</button>
    </div>
  );
}
