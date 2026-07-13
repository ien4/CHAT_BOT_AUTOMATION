'use client';

import { useEffect, useMemo, useState } from 'react';
import { contentPackagesApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type {
  ContentPackage,
  ContentPackageFormState,
  ContentPackageItem,
  ContentPackageItemFormState,
} from '../types';

function createPackageForm(isGlobal: boolean): ContentPackageFormState {
  return {
    name: '',
    description: '',
    isActive: true,
    isPublic: true,
    isGlobal,
  };
}

function createItemForm(order: number): ContentPackageItemFormState {
  return {
    type: 'document',
    title: '',
    content: '',
    url: '',
    description: '',
    tags: '',
    order,
  };
}

export function useContentPackages() {
  const { selectedTenantId, isPlatformAdmin } = useAuth();
  const [packages, setPackages] = useState<ContentPackage[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<ContentPackage | null>(null);
  const [items, setItems] = useState<ContentPackageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showPkgForm, setShowPkgForm] = useState(false);
  const [editPkg, setEditPkg] = useState<Partial<ContentPackage> | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editItem, setEditItem] = useState<Partial<ContentPackageItem> | null>(null);
  const [migrating, setMigrating] = useState(false);

  const [pkgForm, setPkgForm] = useState<ContentPackageFormState>(createPackageForm(false));
  const [itemForm, setItemForm] = useState<ContentPackageItemFormState>(createItemForm(0));

  useEffect(() => { fetchPackages(); }, [selectedTenantId]);

  const fetchPackages = async () => {
    try {
      setLoading(true);
      const res = await contentPackagesApi.list();
      setPackages(res.data.data || []);
    } catch {
      setError('Lỗi tải danh sách gói nội dung');
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async (packageId: string) => {
    try {
      const res = await contentPackagesApi.listItems(packageId);
      setItems(res.data || []);
    } catch {
      setError('Lỗi tải nội dung gói');
    }
  };

  const selectPackage = (pkg: ContentPackage) => {
    setSelectedPkg(pkg);
    fetchItems(pkg.id);
  };

  const globalPackages = useMemo(() => packages.filter(p => p.tenantId === null), [packages]);
  const tenantPackages = useMemo(() => packages.filter(p => p.tenantId !== null), [packages]);

  const canCreateGlobal = isPlatformAdmin;
  const canEditPackage = (pkg: ContentPackage) => {
    if (!isPlatformAdmin && pkg.tenantId === null) return false;
    if (!isPlatformAdmin) return true;
    return true;
  };

  const openNewPkg = () => {
    setEditPkg(null);
    setPkgForm(createPackageForm(!selectedTenantId));
    setShowPkgForm(true);
  };

  const openEditPkg = (pkg: ContentPackage) => {
    setEditPkg({ id: pkg.id });
    setPkgForm({
      name: pkg.name,
      description: pkg.description || '',
      isActive: pkg.isActive,
      isPublic: pkg.isPublic,
      isGlobal: pkg.tenantId === null,
    });
    setShowPkgForm(true);
  };

  const savePkg = async () => {
    try {
      if (editPkg?.id) {
        await contentPackagesApi.update(editPkg.id, {
          name: pkgForm.name,
          description: pkgForm.description,
          isActive: pkgForm.isActive,
          isPublic: pkgForm.isPublic,
        });
      } else {
        await contentPackagesApi.create({
          name: pkgForm.name,
          description: pkgForm.description,
          isActive: pkgForm.isActive,
          isPublic: pkgForm.isPublic,
          isGlobal: pkgForm.isGlobal,
        });
      }
      setShowPkgForm(false);
      fetchPackages();
    } catch {
      setError('Lỗi lưu gói nội dung');
    }
  };

  const deletePkg = async (pkg: ContentPackage) => {
    if (!canEditPackage(pkg)) return;
    if (!confirm('Xóa gói này sẽ xóa tất cả nội dung bên trong. Bạn chắc chứ?')) return;
    try {
      await contentPackagesApi.delete(pkg.id);
      if (selectedPkg?.id === pkg.id) { setSelectedPkg(null); setItems([]); }
      fetchPackages();
    } catch {
      setError('Lỗi xóa gói nội dung');
    }
  };

  const openNewItem = () => {
    if (!selectedPkg) return;
    setEditItem(null);
    setItemForm(createItemForm(items.length));
    setShowItemForm(true);
  };

  const openEditItem = (item: ContentPackageItem) => {
    setEditItem({ id: item.id });
    setItemForm({
      type: item.type,
      title: item.title,
      content: item.content || '',
      url: item.url || '',
      description: item.description || '',
      tags: (item.tags || []).join(', '),
      order: item.order,
    });
    setShowItemForm(true);
  };

  const saveItem = async () => {
    if (!selectedPkg) return;
    try {
      const data = {
        type: itemForm.type,
        title: itemForm.title,
        content: itemForm.content || undefined,
        url: itemForm.url || undefined,
        description: itemForm.description || undefined,
        tags: itemForm.tags.split(',').map(t => t.trim()).filter(Boolean),
        order: itemForm.order,
      };
      if (editItem?.id) {
        await contentPackagesApi.updateItem(selectedPkg.id, editItem.id, data);
      } else {
        await contentPackagesApi.createItem(selectedPkg.id, data);
      }
      setShowItemForm(false);
      fetchItems(selectedPkg.id);
    } catch {
      setError('Lỗi lưu nội dung');
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!selectedPkg || !confirm('Xóa mục này?')) return;
    try {
      await contentPackagesApi.deleteItem(selectedPkg.id, itemId);
      fetchItems(selectedPkg.id);
    } catch {
      setError('Lỗi xóa mục');
    }
  };

  const migrate = async () => {
    if (!confirm('Chuyển toàn bộ dữ liệu từ Campaigns cũ sang Content Packages? Dữ liệu cũ vẫn được giữ nguyên.')) return;
    try {
      setMigrating(true);
      const res = await contentPackagesApi.migrateFromCampaigns();
      alert(`Đã migrate ${res.data.migrated}/${res.data.total} campaigns!`);
      fetchPackages();
    } catch {
      setError('Lỗi migrate dữ liệu');
    } finally {
      setMigrating(false);
    }
  };

  const canEditSelectedPkg = selectedPkg ? canEditPackage(selectedPkg) : false;

  return {
    selectedTenantId,
    isPlatformAdmin,
    packages,
    selectedPkg,
    items,
    loading,
    error,
    showPkgForm,
    editPkg,
    showItemForm,
    editItem,
    migrating,
    pkgForm,
    itemForm,
    globalPackages,
    tenantPackages,
    canCreateGlobal,
    canEditSelectedPkg,
    setError,
    setPkgForm,
    setItemForm,
    setShowPkgForm,
    setShowItemForm,
    selectPackage,
    canEditPackage,
    openNewPkg,
    openEditPkg,
    savePkg,
    deletePkg,
    openNewItem,
    openEditItem,
    saveItem,
    deleteItem,
    migrate,
  };
}
