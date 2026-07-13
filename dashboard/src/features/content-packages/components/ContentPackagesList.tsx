'use client';

import { Building2, Edit2, Globe, Package, Trash2 } from 'lucide-react';
import type { ContentPackage } from '../types';

export function ContentPackagesList({
  packages,
  globalPackages,
  tenantPackages,
  selectedPackageId,
  canEditPackage,
  onSelectPackage,
  onEditPackage,
  onDeletePackage,
}: {
  packages: ContentPackage[];
  globalPackages: ContentPackage[];
  tenantPackages: ContentPackage[];
  selectedPackageId?: string;
  canEditPackage: (pkg: ContentPackage) => boolean;
  onSelectPackage: (pkg: ContentPackage) => void;
  onEditPackage: (pkg: ContentPackage) => void;
  onDeletePackage: (pkg: ContentPackage) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-100 font-medium text-gray-700">
        Danh sách gói ({packages.length})
      </div>
      <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
        {packages.length === 0 && (
          <div className="p-8 text-center text-gray-400">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
            Chưa có gói nội dung nào
          </div>
        )}

        {globalPackages.length > 0 && (
          <>
            <div className="px-4 py-2 bg-blue-50 flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                Dùng chung ({globalPackages.length})
              </span>
            </div>
            {globalPackages.map(pkg => (
              <PackageRow
                key={pkg.id}
                pkg={pkg}
                isSelected={selectedPackageId === pkg.id}
                canEdit={canEditPackage(pkg)}
                onSelect={() => onSelectPackage(pkg)}
                onEdit={() => onEditPackage(pkg)}
                onDelete={() => onDeletePackage(pkg)}
              />
            ))}
          </>
        )}

        {tenantPackages.length > 0 && (
          <>
            <div className="px-4 py-2 bg-purple-50 flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-xs font-semibold text-purple-600 uppercase tracking-wide">
                Riêng tenant ({tenantPackages.length})
              </span>
            </div>
            {tenantPackages.map(pkg => (
              <PackageRow
                key={pkg.id}
                pkg={pkg}
                isSelected={selectedPackageId === pkg.id}
                canEdit={canEditPackage(pkg)}
                onSelect={() => onSelectPackage(pkg)}
                onEdit={() => onEditPackage(pkg)}
                onDelete={() => onDeletePackage(pkg)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function PackageRow({
  pkg,
  isSelected,
  canEdit,
  onSelect,
  onEdit,
  onDelete,
}: {
  pkg: ContentPackage;
  isSelected: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate">
            {!pkg.isActive && <span className="text-red-400 mr-1">⏸</span>}
            {pkg.name}
          </h3>
          {pkg.description && <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{pkg.description}</p>}
          <div className="flex gap-3 mt-1.5 text-xs text-gray-400 items-center">
            <span>{pkg._count?.items || 0} mục</span>
            {!pkg.isPublic && <span className="text-orange-500">Riêng tư</span>}
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-1 ml-2" onClick={e => e.stopPropagation()}>
            <button onClick={onEdit} className="p-1 hover:bg-gray-200 rounded">
              <Edit2 className="w-4 h-4 text-gray-400" />
            </button>
            <button onClick={onDelete} className="p-1 hover:bg-red-100 rounded">
              <Trash2 className="w-4 h-4 text-red-400" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
