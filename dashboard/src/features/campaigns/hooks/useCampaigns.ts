'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { campaignsApi } from '@/lib/api';
import type { Campaign, CampaignAsset } from '../types';

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [assets, setAssets] = useState<CampaignAsset[]>([]);
  const [assetName, setAssetName] = useState('');
  const [assetPrompt, setAssetPrompt] = useState('');
  const [assetUrl, setAssetUrl] = useState('');
  const [assetDesc, setAssetDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await campaignsApi.list();
      setCampaigns(data);
    } catch {
      toast.error('Lỗi tải chiến dịch');
    } finally {
      setLoading(false);
    }
  };

  const addAsset = () => {
    if (!assetName && !assetPrompt && !assetUrl) return toast.error('Nhập ít nhất 1 trường');
    setAssets([...assets, { name: assetName, prompt: assetPrompt, url: assetUrl, description: assetDesc }]);
    setAssetName(''); setAssetPrompt(''); setAssetUrl(''); setAssetDesc('');
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { data } = await campaignsApi.upload(file);
      setAssets([...assets, {
        name: data.name,
        url: data.url,
        description: data.description || '',
      }]);
      toast.success('Tài liệu đã được tải lên');
    } catch {
      toast.error('Lỗi upload tài liệu');
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const removeAsset = (idx: number) => setAssets(assets.filter((_, i) => i !== idx));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { name, description, assets };
      if (editing) {
        await campaignsApi.update(editing.id, payload);
        toast.success('Đã cập nhật');
      } else {
        await campaignsApi.create(payload);
        toast.success('Đã tạo chiến dịch');
      }
      resetForm(); load();
    } catch {
      toast.error('Lỗi lưu');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa?')) return;
    try {
      await campaignsApi.delete(id);
      toast.success('Đã xóa');
      load();
    } catch {
      toast.error('Lỗi xóa');
    }
  };

  const handleEdit = (campaign: Campaign) => {
    setEditing(campaign); setName(campaign.name); setDescription(campaign.description || '');
    setAssets(campaign.assets || []); setShowForm(true);
  };

  const resetForm = () => {
    setEditing(null); setName(''); setDescription(''); setAssets([]);
    setAssetName(''); setAssetPrompt(''); setAssetUrl(''); setAssetDesc(''); setShowForm(false);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  return {
    campaigns,
    loading,
    showForm,
    editing,
    name,
    description,
    assets,
    assetName,
    assetPrompt,
    assetUrl,
    assetDesc,
    submitting,
    uploading,
    setName,
    setDescription,
    setAssetName,
    setAssetPrompt,
    setAssetUrl,
    setAssetDesc,
    openCreate,
    addAsset,
    handleFileUpload,
    removeAsset,
    handleSubmit,
    handleDelete,
    handleEdit,
    resetForm,
  };
}
