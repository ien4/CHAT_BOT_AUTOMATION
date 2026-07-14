export interface CampaignAsset {
  name?: string;
  type?: string;
  prompt?: string;
  url?: string;
  description?: string;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string | null;
  assets?: CampaignAsset[];
  isActive?: boolean;
}
