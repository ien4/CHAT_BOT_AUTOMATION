'use client';

import {
  CampaignFormModal,
  CampaignsEmptyState,
  CampaignsHeader,
  CampaignsList,
  CampaignsLoadingState,
  useCampaigns,
} from '@/features/campaigns';

export default function CampaignsPage() {
  const campaigns = useCampaigns();
  return (
    <div className="space-y-4">
      <CampaignsHeader onCreate={campaigns.openCreate} />

      {campaigns.showForm && (
        <CampaignFormModal
          editing={campaigns.editing}
          name={campaigns.name}
          description={campaigns.description}
          assets={campaigns.assets}
          assetName={campaigns.assetName}
          assetPrompt={campaigns.assetPrompt}
          assetUrl={campaigns.assetUrl}
          assetDesc={campaigns.assetDesc}
          submitting={campaigns.submitting}
          uploading={campaigns.uploading}
          onNameChange={campaigns.setName}
          onDescriptionChange={campaigns.setDescription}
          onAssetNameChange={campaigns.setAssetName}
          onAssetPromptChange={campaigns.setAssetPrompt}
          onAssetUrlChange={campaigns.setAssetUrl}
          onAssetDescChange={campaigns.setAssetDesc}
          onAddAsset={campaigns.addAsset}
          onRemoveAsset={campaigns.removeAsset}
          onFileUpload={campaigns.handleFileUpload}
          onSubmit={campaigns.handleSubmit}
          onCancel={campaigns.resetForm}
        />
      )}

      {campaigns.loading ? (
        <CampaignsLoadingState />
      ) : campaigns.campaigns.length === 0 ? (
        <CampaignsEmptyState />
      ) : (
        <CampaignsList
          campaigns={campaigns.campaigns}
          onEdit={campaigns.handleEdit}
          onDelete={campaigns.handleDelete}
        />
      )}
    </div>
  );
}
