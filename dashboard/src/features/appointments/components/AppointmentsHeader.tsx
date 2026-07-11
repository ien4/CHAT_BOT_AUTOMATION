import { TenantScopeBanner } from '@/components/TenantScopeBanner';

export function AppointmentsHeader() {
  return (
    <>
      <TenantScopeBanner />
      <h1 className="text-2xl font-bold">Lịch hẹn</h1>
    </>
  );
}
