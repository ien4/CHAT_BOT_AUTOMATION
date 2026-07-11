'use client';
import {
  useStaff,
  StaffHeader,
  StaffGuide,
  StaffForm,
  StaffLoadingState,
  StaffEmptyState,
  StaffList,
} from '@/features/staff';

export default function StaffPage() {
  const staff = useStaff();

  return (
    <div className="space-y-4">
      <StaffHeader onAdd={staff.openCreateForm} />

      {/* Hướng dẫn */}
      <StaffGuide />

      {/* Form Modal */}
      <StaffForm
        show={staff.showForm}
        editing={staff.editing}
        name={staff.name}
        telegramChatId={staff.telegramChatId}
        submitting={staff.submitting}
        onNameChange={staff.setName}
        onTelegramChatIdChange={staff.setTelegramChatId}
        onSubmit={staff.handleSubmit}
        onCancel={staff.resetForm}
      />

      {/* Staff list */}
      {staff.loading ? (
        <StaffLoadingState />
      ) : staff.staff.length === 0 ? (
        <StaffEmptyState />
      ) : (
        <StaffList
          staff={staff.staff}
          onEdit={staff.handleEdit}
          onDelete={staff.handleDelete}
          onToggleActive={staff.toggleActive}
          onToggleOnDuty={staff.toggleOnDuty}
        />
      )}
    </div>
  );
}
