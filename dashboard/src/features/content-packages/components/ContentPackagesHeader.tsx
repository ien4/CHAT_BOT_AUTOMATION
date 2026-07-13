'use client';

import { Plus, Zap } from 'lucide-react';

export function ContentPackagesHeader({
  isPlatformAdmin,
  migrating,
  onMigrate,
  onCreatePackage,
}: {
  isPlatformAdmin: boolean;
  migrating: boolean;
  onMigrate: () => void;
  onCreatePackage: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold">📦 Gói nội dung</h1>
        <p className="text-gray-500 mt-1">Quản lý gói nội dung và các mục bên trong</p>
      </div>
      <div className="flex gap-2">
        {isPlatformAdmin && (
          <button onClick={onMigrate} disabled={migrating} className="btn btn-secondary flex items-center gap-2">
            <Zap className="w-4 h-4" />
            {migrating ? 'Đang migrate...' : 'Migrate từ Campaign'}
          </button>
        )}
        <button onClick={onCreatePackage} className="btn btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Tạo gói mới
        </button>
      </div>
    </div>
  );
}
