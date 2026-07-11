'use client';

import { Edit3, MessageCircle, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import type { Staff } from '../types';
import { formatStaffJoinDate, getStaffInitial } from '../lib/staffFormatters';

export function StaffList({
  staff,
  onEdit,
  onDelete,
  onToggleActive,
  onToggleOnDuty,
}: {
  staff: Staff[];
  onEdit: (member: Staff) => void;
  onDelete: (id: string) => void;
  onToggleActive: (member: Staff) => void;
  onToggleOnDuty: (member: Staff) => void;
}) {
  return (
    <div className="grid gap-4">
      {staff.map(member => (
        <div key={member.id} className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg ${member.isActive ? 'bg-blue-500' : 'bg-gray-400'}`}>
                {getStaffInitial(member.name)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{member.name}</h3>
                  {member.isOnDuty ? (
                    <span className="badge badge-green">🟢 Đang trực</span>
                  ) : (
                    <span className="badge badge-gray">⚪ Ngoài trực</span>
                  )}
                  {!member.isActive && <span className="badge badge-red">Vô hiệu</span>}
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
                  <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> Chat ID: {member.telegramChatId}</span>
                  {member.createdAt && <span>Tham gia: {formatStaffJoinDate(member.createdAt)}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onToggleOnDuty(member)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  member.isOnDuty
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {member.isOnDuty ? <ToggleRight className="w-4 h-4 inline mr-1" /> : <ToggleLeft className="w-4 h-4 inline mr-1" />}
                {member.isOnDuty ? 'Bật trực' : 'Tắt trực'}
              </button>
              <button
                onClick={() => onToggleActive(member)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  member.isActive
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                }`}
              >
                {member.isActive ? 'Kích hoạt' : 'Vô hiệu'}
              </button>
              <button onClick={() => onEdit(member)} className="p-2 text-gray-400 hover:text-blue-600"><Edit3 className="w-4 h-4" /></button>
              <button onClick={() => onDelete(member.id)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
