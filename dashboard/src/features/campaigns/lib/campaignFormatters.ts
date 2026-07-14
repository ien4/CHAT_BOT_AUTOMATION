import type { CampaignAsset } from '../types';

export function getCampaignFormAssetLabel(asset: CampaignAsset, index: number) {
  return asset.name || asset.prompt?.substring(0, 40) || 'Asset ' + (index + 1);
}

export function getCampaignListAssetLabel(asset: CampaignAsset, index: number) {
  return asset.name || asset.prompt?.substring(0, 30) || 'Asset ' + (index + 1);
}
