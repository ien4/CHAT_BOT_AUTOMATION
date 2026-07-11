'use client';
import {
  useAppointments,
  AppointmentsHeader,
  AppointmentFilters,
  AppointmentLoadingState,
  AppointmentEmptyState,
  AppointmentList,
  AppointmentPagination,
} from '@/features/appointments';

export default function AppointmentsPage() {
  const appointments = useAppointments();

  return (
    <div className="space-y-4">
      <AppointmentsHeader />

      <AppointmentFilters statusFilter={appointments.statusFilter} onStatusChange={appointments.handleStatusFilterChange} />

      {appointments.loading ? (
        <AppointmentLoadingState />
      ) : appointments.appointments.length === 0 ? (
        <AppointmentEmptyState />
      ) : (
        <AppointmentList appointments={appointments.appointments} onUpdateStatus={appointments.updateStatus} />
      )}

      <AppointmentPagination
        page={appointments.page}
        totalPages={appointments.totalPages}
        onPrevious={appointments.goPreviousPage}
        onNext={appointments.goNextPage}
      />
    </div>
  );
}
