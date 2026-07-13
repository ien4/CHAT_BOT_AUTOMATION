'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Building2, Globe, Save } from 'lucide-react';
import type { ContentPackageFormState } from '../types';

export function ContentPackageFormModal({
  editPackageId,
  canCreateGlobal,
  selectedTenantId,
  pkgForm,
  setPkgForm,
  onClose,
  onSave,
}: {
  editPackageId?: string;
  canCreateGlobal: boolean;
  selectedTenantId: string | null;
  pkgForm: ContentPackageFormState;
  setPkgForm: Dispatch<SetStateAction<ContentPackageFormState>>;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-[500px] max-h-[90vh] overflow-y-auto p-6">
        <h3 className="text-lg font-semibold mb-4">{editPackageId ? 'Sửa gói' : 'Tạo gói mới'}</h3>
        <div className="space-y-4">
          {!editPackageId && canCreateGlobal && selectedTenantId && (
            <div>
              <label className="block text-sm font-medium mb-2">Phạm vi gói *</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPkgForm({ ...pkgForm, isGlobal: false })}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${!pkgForm.isGlobal ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="flex items-center gap-1.5 font-medium text-sm">
                    <Building2 className="w-4 h-4 text-purple-600" /> Riêng tenant
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Chỉ tenant hiện tại dùng</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPkgForm({ ...pkgForm, isGlobal: true })}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${pkgForm.isGlobal ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="flex items-center gap-1.5 font-medium text-sm">
                    <Globe className="w-4 h-4 text-blue-600" /> Dùng chung
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Tất cả tenant đều thấy</p>
                </button>
              </div>
            </div>
          )}
          {!editPackageId && canCreateGlobal && !selectedTenantId && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-sm text-blue-700">
              <Globe className="w-4 h-4" />
              Gói này sẽ là <strong>Dùng chung</strong> (tất cả tenant thấy)
            </div>
          )}
          {!editPackageId && !canCreateGlobal && (
            <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-lg text-sm text-purple-700">
              <Building2 className="w-4 h-4" />
              Gói này sẽ là <strong>Riêng tenant</strong> của bạn
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Tên gói *</label>
            <input
              type="text"
              value={pkgForm.name}
              onChange={e => setPkgForm({ ...pkgForm, name: e.target.value })}
              className="input"
              placeholder="Ví dụ: Chiến dịch Tết 2026"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Mô tả</label>
            <textarea
              value={pkgForm.description}
              onChange={e => setPkgForm({ ...pkgForm, description: e.target.value })}
              className="input"
              rows={3}
            />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={pkgForm.isActive}
                onChange={e => setPkgForm({ ...pkgForm, isActive: e.target.checked })}
              />
              <span className="text-sm">Hoạt động</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={pkgForm.isPublic}
                onChange={e => setPkgForm({ ...pkgForm, isPublic: e.target.checked })}
              />
              <span className="text-sm">Công khai</span>
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="btn btn-secondary">Hủy</button>
          <button onClick={onSave} disabled={!pkgForm.name} className="btn btn-primary">
            <Save className="w-4 h-4 mr-1" /> Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
