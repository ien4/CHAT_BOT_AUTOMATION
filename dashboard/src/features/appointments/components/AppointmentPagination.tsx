'use client';

export function AppointmentPagination({
  page,
  totalPages,
  onPrevious,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex justify-center gap-2">
      <button onClick={onPrevious} disabled={page === 1} className="btn-secondary">Trước</button>
      <span className="text-sm py-1">{page}/{totalPages}</span>
      <button onClick={onNext} disabled={page === totalPages} className="btn-secondary">Sau</button>
    </div>
  );
}
