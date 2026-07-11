'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { promptsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { PromptPayload, PromptTemplate } from '../types';
import { filterPrompts, getDefaultIntentType, getDefaultLayer, getPromptTabCount } from '../lib/promptFormatters';

export function usePrompts() {
  const { selectedTenantId } = useAuth();
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PromptTemplate | null>(null);
  const [name, setName] = useState('');
  const [intentType, setIntentType] = useState('general');
  const [layer, setLayer] = useState('intent');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPromptTemplate, setUserPromptTemplate] = useState('');
  const [modelPreference, setModelPreference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { load(); }, [selectedTenantId]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await promptsApi.list();
      setTemplates(data);
    } catch (e) { toast.error('Lỗi tải prompt'); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => filterPrompts(templates, activeTab), [templates, activeTab]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: PromptPayload = {
        name,
        intentType: (layer === 'identity' || layer === 'guardrails') ? layer : intentType,
        layer,
        systemPrompt,
        userPromptTemplate,
        modelPreference: modelPreference || null,
      };
      if (editing) {
        await promptsApi.update(editing.id, payload);
        toast.success('Đã cập nhật');
      } else {
        await promptsApi.create(payload);
        toast.success('Đã thêm prompt');
      }
      resetForm();
      load();
    } catch (e) { toast.error('Lỗi lưu'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa?')) return;
    try { await promptsApi.delete(id); toast.success('Đã xóa'); load(); }
    catch { toast.error('Lỗi xóa'); }
  };

  const handleEdit = (t: PromptTemplate) => {
    setEditing(t);
    setName(t.name);
    setIntentType(t.intentType);
    setLayer(t.layer || 'intent');
    setSystemPrompt(t.systemPrompt);
    setUserPromptTemplate(t.userPromptTemplate || '');
    setModelPreference(t.modelPreference || '');
    setShowForm(true);
  };

  const resetForm = () => {
    setEditing(null);
    setName('');
    setLayer(getDefaultLayer(activeTab));
    setIntentType(getDefaultIntentType(activeTab));
    setSystemPrompt('');
    setUserPromptTemplate('');
    setModelPreference('');
    setShowForm(false);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    resetForm();
    setShowForm(false);
  };

  const getTabCount = (key: string) => getPromptTabCount(templates, key);
  const isLayerFixed = layer === 'identity' || layer === 'guardrails';

  return {
    templates,
    filtered,
    loading,
    activeTab,
    showForm,
    editing,
    name,
    intentType,
    layer,
    systemPrompt,
    userPromptTemplate,
    modelPreference,
    submitting,
    isLayerFixed,
    setName,
    setIntentType,
    setLayer,
    setSystemPrompt,
    setUserPromptTemplate,
    setModelPreference,
    handleSubmit,
    handleDelete,
    handleEdit,
    handleTabChange,
    getTabCount,
    resetForm,
    openCreateForm,
  };
}
