'use client';

// Bộ lọc kỳ (days) — giữ nguyên label/select/option như page cũ.
export function AnalyticsFilters({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-500">Kỳ:</label>
      <select value={days} onChange={e => onChange(Number(e.target.value))} className="input-field w-auto text-sm">
        <option value={7}>7 ngày</option>
        <option value={30}>30 ngày</option>
        <option value={90}>90 ngày</option>
      </select>
    </div>
  );
}
