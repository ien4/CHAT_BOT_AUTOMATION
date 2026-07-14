'use client';

import { TenantScopeBanner } from '@/components/TenantScopeBanner';
import {
  QuickRepliesEmptyState,
  QuickRepliesErrorBanner,
  QuickRepliesHeader,
  QuickRepliesList,
  QuickRepliesLoadingState,
  QuickReplyFormModal,
  useQuickReplies,
} from '@/features/quick-replies';

export default function QuickRepliesPage() {
  const quickReplies = useQuickReplies();

  if (quickReplies.loading) return <QuickRepliesLoadingState />;

  return (
    <div>
      <TenantScopeBanner />
      <QuickRepliesHeader onCreate={quickReplies.openNew} />

      {quickReplies.error && (
        <QuickRepliesErrorBanner error={quickReplies.error} onDismiss={() => quickReplies.setError(null)} />
      )}

      {quickReplies.menus.length === 0 ? (
        <QuickRepliesEmptyState />
      ) : (
        <QuickRepliesList
          menus={quickReplies.menus}
          onEdit={quickReplies.openEdit}
          onDelete={quickReplies.del}
        />
      )}

      {quickReplies.showForm && (
        <QuickReplyFormModal
          editMenuId={quickReplies.editMenu?.id}
          form={quickReplies.form}
          setForm={quickReplies.setForm}
          onAddItemRow={quickReplies.addItemRow}
          onRemoveItemRow={quickReplies.removeItemRow}
          onUpdateItem={quickReplies.updateItem}
          onClose={() => quickReplies.setShowForm(false)}
          onSave={quickReplies.save}
        />
      )}
    </div>
  );
}
