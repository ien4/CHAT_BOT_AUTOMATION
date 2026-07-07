'use client';
import { useAuth } from '@/lib/auth';
import { Building2, Globe } from 'lucide-react';

interface Props {
  tenantName?: string;
}

export function TenantScopeBanner({ tenantName }: Props) {
  const { isPlatformAdmin, selectedTenantId } = useAuth();
  if (!isPlatformAdmin) return null;

  const isGlobal = !selectedTenantId;

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-4 ${
      isGlobal
        ? 'bg-gray-50 border border-gray-200 text-gray-600'
        : 'bg-blue-50 border border-blue-200 text-blue-700'
    }`}>
      {isGlobal ? <Globe className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
      <span>
        {isGlobal
          ? 'Đang xem dữ liệu Global (dùng chung cho tất cả tenant)'
          : `Đang xem dữ liệu của: ${tenantName ?? 'tenant đã chọn'}`}
      </span>
    </div>
  );
}
