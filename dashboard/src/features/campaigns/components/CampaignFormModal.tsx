import type { ChangeEvent, FormEvent } from 'react';
import { FileText, Loader2, Package, Trash2, Upload } from 'lucide-react';
import { API_BASE_URL } from '@/lib/config/env';
import { getCampaignFormAssetLabel } from '../lib/campaignFormatters';
import type { Campaign, CampaignAsset } from '../types';

interface CampaignFormModalProps {
  editing: Campaign | null;
  name: string;
  description: string;
  assets: CampaignAsset[];
  assetName: string;
  assetPrompt: string;
  assetUrl: string;
  assetDesc: string;
  submitting: boolean;
  uploading: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onAssetNameChange: (value: string) => void;
  onAssetPromptChange: (value: string) => void;
  onAssetUrlChange: (value: string) => void;
  onAssetDescChange: (value: string) => void;
  onAddAsset: () => void;
  onRemoveAsset: (index: number) => void;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

export function CampaignFormModal({
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
  onNameChange,
  onDescriptionChange,
  onAssetNameChange,
  onAssetPromptChange,
  onAssetUrlChange,
  onAssetDescChange,
  onAddAsset,
  onRemoveAsset,
  onFileUpload,
  onSubmit,
  onCancel,
}: CampaignFormModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold">{editing ? 'Sửa chiến dịch' : 'Thêm chiến dịch'}</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <input value={name} onChange={e => onNameChange(e.target.value)} className="input-field" placeholder="Tên chiến dịch" required />
          <textarea value={description} onChange={e => onDescriptionChange(e.target.value)} className="input-field" placeholder="Mô tả chiến dịch" rows={3} />

          <div className="border rounded-lg p-3 space-y-2">
            <h3 className="font-medium text-sm">Tài liệu / Assets</h3>
            {assets.map((asset, index) => (
              <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded text-sm">
                {asset.url ? <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" /> : <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                <span className="flex-1 truncate">{getCampaignFormAssetLabel(asset, index)}</span>
                {asset.url && <a href={`${API_BASE_URL}${asset.url}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline flex-shrink-0">Xem</a>}
                <button type="button" onClick={() => onRemoveAsset(index)} className="text-red-500 hover:text-red-700 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}

            {/* Upload file button */}
            <div className="flex items-center gap-2">
              <label className={`btn-secondary text-sm flex items-center gap-1 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Đang upload...' : 'Upload file'}
                <input type="file" accept=".pdf,.docx,.txt,.md,.json,.png,.jpg,.jpeg,.gif,.webp" onChange={onFileUpload} className="hidden" disabled={uploading} />
              </label>
              <span className="text-xs text-gray-400">PDF, DOCX, TXT, ảnh...</span>
            </div>

            <div className="border-t pt-2 mt-2">
              <p className="text-xs text-gray-400 mb-2">Hoặc thêm thủ công:</p>
              <div className="grid grid-cols-2 gap-2">
                <input value={assetName} onChange={e => onAssetNameChange(e.target.value)} className="input-field text-sm" placeholder="Tên asset" />
                <input value={assetUrl} onChange={e => onAssetUrlChange(e.target.value)} className="input-field text-sm" placeholder="URL" />
              </div>
              <textarea value={assetPrompt} onChange={e => onAssetPromptChange(e.target.value)} className="input-field text-sm mt-2" placeholder="Prompt" rows={2} />
              <input value={assetDesc} onChange={e => onAssetDescChange(e.target.value)} className="input-field text-sm mt-2" placeholder="Mô tả" />
              <button type="button" onClick={onAddAsset} className="btn-secondary text-sm mt-2">+ Thêm asset</button>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onCancel} className="btn-secondary">Hủy</button>
            <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Lưu...' : 'Lưu'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
