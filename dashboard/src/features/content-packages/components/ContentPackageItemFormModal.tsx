'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Save } from 'lucide-react';
import type { ContentPackageItemFormState } from '../types';

export function ContentPackageItemFormModal({
  editItemId,
  itemForm,
  setItemForm,
  onClose,
  onSave,
}: {
  editItemId?: string;
  itemForm: ContentPackageItemFormState;
  setItemForm: Dispatch<SetStateAction<ContentPackageItemFormState>>;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-[550px] max-h-[90vh] overflow-y-auto p-6">
        <h3 className="text-lg font-semibold mb-4">{editItemId ? 'Sửa mục' : 'Thêm mục mới'}</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Loại *</label>
              <select
                value={itemForm.type}
                onChange={e => setItemForm({ ...itemForm, type: e.target.value })}
                className="input"
              >
                <option value="document">📄 Tài liệu</option>
                <option value="image_prompt">🎨 Prompt hình ảnh</option>
                <option value="link">🔗 Liên kết</option>
                <option value="skill">🛠 Kỹ năng</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Thứ tự</label>
              <input
                type="number"
                value={itemForm.order}
                onChange={e => setItemForm({ ...itemForm, order: parseInt(e.target.value) || 0 })}
                className="input"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tiêu đề *</label>
            <input
              type="text"
              value={itemForm.title}
              onChange={e => setItemForm({ ...itemForm, title: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Mô tả</label>
            <input
              type="text"
              value={itemForm.description}
              onChange={e => setItemForm({ ...itemForm, description: e.target.value })}
              className="input"
            />
          </div>
          {(itemForm.type === 'image_prompt' || itemForm.type === 'document') && (
            <div>
              <label className="block text-sm font-medium mb-1">
                {itemForm.type === 'image_prompt' ? 'Nội dung Prompt' : 'Nội dung'}
              </label>
              <textarea
                value={itemForm.content}
                onChange={e => setItemForm({ ...itemForm, content: e.target.value })}
                className="input"
                rows={4}
              />
            </div>
          )}
          {itemForm.type === 'link' && (
            <div>
              <label className="block text-sm font-medium mb-1">URL</label>
              <input
                type="url"
                value={itemForm.url}
                onChange={e => setItemForm({ ...itemForm, url: e.target.value })}
                className="input"
                placeholder="https://..."
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Tags (phân cách bằng dấu phẩy)</label>
            <input
              type="text"
              value={itemForm.tags}
              onChange={e => setItemForm({ ...itemForm, tags: e.target.value })}
              className="input"
              placeholder="VD: tết, banner, marketing"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="btn btn-secondary">Hủy</button>
          <button onClick={onSave} disabled={!itemForm.title} className="btn btn-primary">
            <Save className="w-4 h-4 mr-1" /> Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
