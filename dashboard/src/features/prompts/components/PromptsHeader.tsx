'use client';

import { Plus } from 'lucide-react';
import { TenantScopeBanner } from '@/components/TenantScopeBanner';

export function PromptsHeader({ onAdd }: { onAdd: () => void }) {
  return (
    <>
      <TenantScopeBanner />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Prompt Templates</h1>
        <button onClick={onAdd} className="btn-primary flex items-center gap-1">
          <Plus className="w-4 h-4" /> Thêm
        </button>
      </div>
    </>
  );
}
