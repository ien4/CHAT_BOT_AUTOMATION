export interface Appointment {
  id: string;
  fbUserName?: string | null;
  phone?: string | null;
  date?: string | null;
  time?: string | null;
  status: string;
  notes?: string | null;
  createdAt: string;
}

export type AppointmentStatusFilter = 'pending' | 'confirmed' | 'cancelled' | '';
