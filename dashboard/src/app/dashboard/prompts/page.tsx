'use client';
import {
  usePrompts,
  PromptsHeader,
  PromptTabs,
  PromptForm,
  PromptLoadingState,
  PromptEmptyState,
  PromptList,
} from '@/features/prompts';

export default function PromptsPage() {
  const prompts = usePrompts();

  return (
    <div className="space-y-4">
      <PromptsHeader onAdd={prompts.openCreateForm} />

      {/* Tabs */}
      <PromptTabs activeTab={prompts.activeTab} getTabCount={prompts.getTabCount} onChange={prompts.handleTabChange} />

      <PromptForm
        show={prompts.showForm}
        editing={prompts.editing}
        name={prompts.name}
        intentType={prompts.intentType}
        layer={prompts.layer}
        systemPrompt={prompts.systemPrompt}
        userPromptTemplate={prompts.userPromptTemplate}
        modelPreference={prompts.modelPreference}
        submitting={prompts.submitting}
        isLayerFixed={prompts.isLayerFixed}
        onNameChange={prompts.setName}
        onIntentTypeChange={prompts.setIntentType}
        onLayerChange={prompts.setLayer}
        onSystemPromptChange={prompts.setSystemPrompt}
        onUserPromptTemplateChange={prompts.setUserPromptTemplate}
        onModelPreferenceChange={prompts.setModelPreference}
        onSubmit={prompts.handleSubmit}
        onCancel={prompts.resetForm}
      />

      {prompts.loading ? (
        <PromptLoadingState />
      ) : prompts.filtered.length === 0 ? (
        <PromptEmptyState activeTab={prompts.activeTab} />
      ) : (
        <PromptList prompts={prompts.filtered} onEdit={prompts.handleEdit} onDelete={prompts.handleDelete} />
      )}
    </div>
  );
}
