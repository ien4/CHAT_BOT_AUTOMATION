'use client';

import type { FormEvent } from 'react';
import type { Staff } from '../types';

export function StaffForm({
  show,
  editing,
  name,
  telegramChatId,
  submitting,
  onNameChange,
  onTelegramChatIdChange,
  onSubmit,
  onCancel,
}: {
  show: boolean;
  editing: Staff | null;
  name: string;
  telegramChatId: string;
  submitting: boolean;
  onNameChange: (value: string) => void;
  onTelegramChatIdChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold">{editing ? 'Sửa nhân viên' : 'Thêm nhân viên'}</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500">Tên nhân viên</label>
            <input value={name} onChange={e => onNameChange(e.target.value)} className="input-field" placeholder="VD: Nguyễn Văn A" required />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Telegram Chat ID</label>
            <input value={telegramChatId} onChange={e => onTelegramChatIdChange(e.target.value)} className="input-field" placeholder="VD: 123456789" required />
            <p className="text-xs text-gray-400 mt-1">Nhân viên chat với bot → gõ /myid để lấy Chat ID</p>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onCancel} className="btn-secondary">Hủy</button>
            <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Thêm'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
