export interface ContentPackage {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  isActive: boolean;
  isPublic: boolean;
  tenantId: string | null;
  _count?: { items: number };
  createdAt: string;
}

export type ContentPackageItemType = 'image_prompt' | 'skill' | 'link' | 'document';

export interface ContentPackageItem {
  id: string;
  packageId: string;
  type: ContentPackageItemType;
  title: string;
  content?: string;
  url?: string;
  fileUrl?: string;
  description?: string;
  tags: string[];
  order: number;
}

export interface ContentPackageFormState {
  name: string;
  description: string;
  isActive: boolean;
  isPublic: boolean;
  isGlobal: boolean;
}

export interface ContentPackageItemFormState {
  type: string;
  title: string;
  content: string;
  url: string;
  description: string;
  tags: string;
  order: number;
}
