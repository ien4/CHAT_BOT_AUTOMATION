'use client';

import { Plus } from 'lucide-react';

export function StaffHeader({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">Nhân viên</h1>
        <p className="text-gray-500 text-sm mt-1">Quản lý nhân viên trực handoff qua Telegram</p>
      </div>
      <button onClick={onAdd} className="btn-primary flex items-center gap-1">
        <Plus className="w-4 h-4" /> Thêm nhân viên
      </button>
    </div>
  );
}
