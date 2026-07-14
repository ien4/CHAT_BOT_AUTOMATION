'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Save, X } from 'lucide-react';
import type { QuickReplyFormState } from '../types';
import { INTENT_TYPES } from '../lib/quickReplyFormatters';

export function QuickReplyFormModal({
  editMenuId,
  form,
  setForm,
  onAddItemRow,
  onRemoveItemRow,
  onUpdateItem,
  onClose,
  onSave,
}: {
  editMenuId?: string;
  form: QuickReplyFormState;
  setForm: Dispatch<SetStateAction<QuickReplyFormState>>;
  onAddItemRow: () => void;
  onRemoveItemRow: (idx: number) => void;
  onUpdateItem: (idx: number, field: string, val: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-[600px] max-h-[90vh] overflow-y-auto p-6">
        <h3 className="text-lg font-semibold mb-4">{editMenuId ? 'Sửa menu' : 'Tạo menu mới'}</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Intent Type *</label>
              <select value={form.intentType} onChange={e => setForm({ ...form, intentType: e.target.value })} className="input" disabled={!!editMenuId}>
                {INTENT_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Page ID (bỏ trống = global)</label>
              <input type="text" value={form.pageId} onChange={e => setForm({ ...form, pageId: e.target.value })} className="input" placeholder="All pages" />
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />
            <span className="text-sm">Active</span>
          </label>
          <div>
            <label className="block text-sm font-medium mb-2">Items (title + payload)</label>
            {form.items.map((item, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <input type="text" placeholder="Title" value={item.title} onChange={e => onUpdateItem(idx, 'title', e.target.value)} className="input flex-1" />
                <input type="text" placeholder="Payload" value={item.payload} onChange={e => onUpdateItem(idx, 'payload', e.target.value)} className="input flex-1" />
                <button onClick={() => onRemoveItemRow(idx)} className="p-2 text-red-400 hover:bg-red-50 rounded"><X className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={onAddItemRow} className="text-sm text-blue-600 hover:underline mt-1">+ Thêm item</button>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="btn btn-secondary">Hủy</button>
          <button onClick={onSave} className="btn btn-primary"><Save className="w-4 h-4 mr-1" /> Lưu</button>
        </div>
      </div>
    </div>
  );
}
