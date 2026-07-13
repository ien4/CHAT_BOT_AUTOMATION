'use client';

import { Building2, Edit2, FileText, Globe, Image, Link as LinkIcon, Package, Plus, Trash2, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ContentPackage, ContentPackageItem } from '../types';
import { getContentPackageItemTypeLabel } from '../lib/contentPackageFormatters';

function getTypeIcon(type: string): ReactNode {
  switch (type) {
    case 'image_prompt': return <Image className="w-4 h-4" />;
    case 'link': return <LinkIcon className="w-4 h-4" />;
    case 'document': return <FileText className="w-4 h-4" />;
    case 'skill': return <Wrench className="w-4 h-4" />;
    default: return <FileText className="w-4 h-4" />;
  }
}

export function ContentPackageDetails({
  selectedPkg,
  items,
  canEditSelectedPkg,
  onNewItem,
  onEditItem,
  onDeleteItem,
}: {
  selectedPkg: ContentPackage | null;
  items: ContentPackageItem[];
  canEditSelectedPkg: boolean;
  onNewItem: () => void;
  onEditItem: (item: ContentPackageItem) => void;
  onDeleteItem: (itemId: string) => void;
}) {
  if (!selectedPkg) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
        <Package className="w-16 h-16 mx-auto mb-3 opacity-30" />
        Chọn một gói nội dung bên trái để xem chi tiết
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-lg">{selectedPkg.name}</h2>
            {selectedPkg.tenantId === null ? (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                <Globe className="w-3 h-3" /> Dùng chung
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                <Building2 className="w-3 h-3" /> Riêng tenant
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">{selectedPkg.description || 'Chưa có mô tả'}</p>
        </div>
        {canEditSelectedPkg && (
          <button onClick={onNewItem} className="btn btn-primary btn-sm flex items-center gap-1">
            <Plus className="w-3 h-3" /> Thêm mục
          </button>
        )}
      </div>

      {!canEditSelectedPkg && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-600 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" />
          Gói dùng chung — chỉ platform admin mới chỉnh sửa được
        </div>
      )}

      <div className="max-h-[530px] overflow-y-auto">
        {items.length === 0 && (
          <div className="p-8 text-center text-gray-400">
            Chưa có nội dung trong gói này
          </div>
        )}
        {items.map(item => (
          <div key={item.id} className="p-4 border-b border-gray-50 hover:bg-gray-50">
            <div className="flex items-start justify-between">
              <div className="flex gap-3 flex-1 min-w-0">
                <span className="mt-0.5 text-lg">{getTypeIcon(item.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                      {getContentPackageItemTypeLabel(item.type)}
                    </span>
                    <h4 className="font-medium text-gray-900">{item.title}</h4>
                  </div>
                  {item.description && <p className="text-sm text-gray-500 mt-1">{item.description}</p>}
                  {item.type === 'image_prompt' && item.content && (
                    <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto max-h-24">{item.content}</pre>
                  )}
                  {item.type === 'link' && item.url && (
                    <a href={item.url} target="_blank" className="text-sm text-blue-600 hover:underline mt-1 inline-block">{item.url}</a>
                  )}
                  {item.type === 'document' && item.content && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.content}</p>
                  )}
                  {(item.tags?.length > 0) && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {item.tags.map((tag: string) => (
                        <span key={tag} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {canEditSelectedPkg && (
                <div className="flex gap-1 ml-2">
                  <button onClick={() => onEditItem(item)} className="p-1 hover:bg-gray-200 rounded">
                    <Edit2 className="w-4 h-4 text-gray-400" />
                  </button>
                  <button onClick={() => onDeleteItem(item.id)} className="p-1 hover:bg-red-100 rounded">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
