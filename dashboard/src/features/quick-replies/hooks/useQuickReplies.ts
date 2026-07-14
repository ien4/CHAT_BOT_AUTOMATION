'use client';

import { useEffect, useState } from 'react';
import { quickReplyMenusApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { QuickReplyFormState, QuickReplyMenu } from '../types';

function createDefaultForm(): QuickReplyFormState {
  return {
    intentType: 'general',
    pageId: '',
    items: [{ title: '', payload: '' }],
    isActive: true,
  };
}

export function useQuickReplies() {
  const { selectedTenantId } = useAuth();
  const [menus, setMenus] = useState<QuickReplyMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editMenu, setEditMenu] = useState<QuickReplyMenu | null>(null);
  const [form, setForm] = useState<QuickReplyFormState>(createDefaultForm);

  useEffect(() => { fetchMenus(); }, [selectedTenantId]);

  const fetchMenus = async () => {
    try {
      const res = await quickReplyMenusApi.list();
      setMenus(res.data || []);
    } catch {
      setError('Lỗi tải danh sách menu');
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setEditMenu(null);
    setForm(createDefaultForm());
    setShowForm(true);
  };

  const openEdit = (menu: QuickReplyMenu) => {
    setEditMenu(menu);
    setForm({
      intentType: menu.intentType,
      pageId: menu.pageId || '',
      items: menu.items?.length ? [...menu.items] : [{ title: '', payload: '' }],
      isActive: menu.isActive,
    });
    setShowForm(true);
  };

  const addItemRow = () => setForm({ ...form, items: [...form.items, { title: '', payload: '' }] });

  const removeItemRow = (idx: number) => {
    if (form.items.length <= 1) return;
    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  };

  const updateItem = (idx: number, field: string, val: string) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: val };
    setForm({ ...form, items });
  };

  const save = async () => {
    const validItems = form.items.filter(item => item.title && item.payload);
    if (!validItems.length) return setError('Cần ít nhất 1 item có title + payload');
    try {
      const data = { ...form, items: validItems, pageId: form.pageId || undefined };
      if (editMenu?.id) await quickReplyMenusApi.update(editMenu.id, data);
      else await quickReplyMenusApi.create(data);
      setShowForm(false);
      fetchMenus();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Lỗi lưu menu');
    }
  };

  const del = async (id: string) => {
    if (!confirm('Xóa menu này?')) return;
    try {
      await quickReplyMenusApi.delete(id);
      fetchMenus();
    } catch {
      setError('Lỗi xóa menu');
    }
  };

  return {
    menus,
    loading,
    error,
    showForm,
    editMenu,
    form,
    setError,
    setForm,
    setShowForm,
    openNew,
    openEdit,
    addItemRow,
    removeItemRow,
    updateItem,
    save,
    del,
  };
}
