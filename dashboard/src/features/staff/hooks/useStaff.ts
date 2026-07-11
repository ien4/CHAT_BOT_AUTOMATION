'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { staffApi } from '@/lib/api';
import type { Staff, StaffFormPayload } from '../types';

export function useStaff() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [name, setName] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await staffApi.list();
      setStaff(data);
    } catch (e) { toast.error('Lỗi tải nhân viên'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: StaffFormPayload = { name, telegramChatId };
      if (editing) {
        await staffApi.update(editing.id, payload);
        toast.success('Đã cập nhật');
      } else {
        await staffApi.create(payload);
        toast.success('Đã thêm nhân viên');
      }
      resetForm();
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Lỗi lưu');
    }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa nhân viên này?')) return;
    try {
      await staffApi.delete(id);
      toast.success('Đã xóa');
      load();
    } catch { toast.error('Lỗi xóa'); }
  };

  const toggleOnDuty = async (member: Staff) => {
    try {
      await staffApi.update(member.id, { isOnDuty: !member.isOnDuty });
      load();
    } catch { toast.error('Lỗi cập nhật'); }
  };

  const toggleActive = async (member: Staff) => {
    try {
      await staffApi.update(member.id, { isActive: !member.isActive });
      load();
    } catch { toast.error('Lỗi cập nhật'); }
  };

  const handleEdit = (member: Staff) => {
    setEditing(member);
    setName(member.name);
    setTelegramChatId(member.telegramChatId);
    setShowForm(true);
  };

  const resetForm = () => {
    setEditing(null);
    setName('');
    setTelegramChatId('');
    setShowForm(false);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  return {
    staff,
    loading,
    showForm,
    editing,
    name,
    telegramChatId,
    submitting,
    setName,
    setTelegramChatId,
    handleSubmit,
    handleDelete,
    toggleOnDuty,
    toggleActive,
    handleEdit,
    resetForm,
    openCreateForm,
  };
}
