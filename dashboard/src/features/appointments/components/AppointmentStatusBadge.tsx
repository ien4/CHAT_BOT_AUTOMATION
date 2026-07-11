import { getAppointmentStatusBadge } from '../lib/appointmentFormatters';

export function AppointmentStatusBadge({ status }: { status: string }) {
  const item = getAppointmentStatusBadge(status);
  const Icon = item.icon;

  return <span className={`badge ${item.cls}`}><Icon className="w-3 h-3 mr-1" />{item.label}</span>;
}
