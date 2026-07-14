import { Edit3, Package, Trash2 } from 'lucide-react';
import { getCampaignListAssetLabel } from '../lib/campaignFormatters';
import type { Campaign, CampaignAsset } from '../types';

interface CampaignsListProps {
  campaigns: Campaign[];
  onEdit: (campaign: Campaign) => void;
  onDelete: (id: string) => void;
}

export function CampaignsList({ campaigns, onEdit, onDelete }: CampaignsListProps) {
  return (
    <div className="grid gap-4">
      {campaigns.map(campaign => (
        <div key={campaign.id} className="card">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold">{campaign.name}</h3>
                {campaign.isActive ? <span className="badge badge-green">Active</span> : <span className="badge badge-red">Inactive</span>}
              </div>
              {campaign.description && <p className="text-sm text-gray-600 mb-3">{campaign.description}</p>}
              {campaign.assets && campaign.assets.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {campaign.assets.map((asset: CampaignAsset, index: number) => (
                    <span key={index} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs">
                      <Package className="w-3 h-3" /> {getCampaignListAssetLabel(asset, index)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-1 ml-4">
              <button onClick={() => onEdit(campaign)} className="p-2 text-gray-400 hover:text-blue-600"><Edit3 className="w-4 h-4" /></button>
              <button onClick={() => onDelete(campaign.id)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
