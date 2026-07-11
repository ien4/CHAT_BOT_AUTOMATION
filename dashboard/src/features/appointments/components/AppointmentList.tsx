'use client';

import type { Appointment } from '../types';
import { AppointmentCard } from './AppointmentCard';

export function AppointmentList({
  appointments,
  onUpdateStatus,
}: {
  appointments: Appointment[];
  onUpdateStatus: (id: string, status: string) => void;
}) {
  return (
    <div className="grid gap-4">
      {appointments.map(appointment => (
        <AppointmentCard key={appointment.id} appointment={appointment} onUpdateStatus={onUpdateStatus} />
      ))}
    </div>
  );
}
