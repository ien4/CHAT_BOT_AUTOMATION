'use client';

import { Edit2, Trash2 } from 'lucide-react';
import type { QuickReplyMenu } from '../types';
import { getIntentTypeLabel } from '../lib/quickReplyFormatters';

export function QuickRepliesList({
  menus,
  onEdit,
  onDelete,
}: {
  menus: QuickReplyMenu[];
  onEdit: (menu: QuickReplyMenu) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid gap-4">
      {menus.map(menu => (
        <div key={menu.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-semibold text-lg">{getIntentTypeLabel(menu.intentType)}</span>
                {menu.pageId && <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded">Page: {menu.pageId}</span>}
                {!menu.isActive && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">Inactive</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {(menu.items || []).map((item, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm">
                    {item.title}
                    <span className="text-blue-400 text-xs">→ {item.payload}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-1 ml-4">
              <button onClick={() => onEdit(menu)} className="p-1 hover:bg-gray-200 rounded"><Edit2 className="w-4 h-4 text-gray-400" /></button>
              <button onClick={() => onDelete(menu.id)} className="p-1 hover:bg-red-100 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
