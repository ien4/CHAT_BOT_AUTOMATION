'use client';

import { X } from 'lucide-react';

export function QuickRepliesErrorBanner({
  error,
  onDismiss,
}: {
  error: string;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 flex justify-between">
      <span>{error}</span>
      <button onClick={onDismiss}><X className="w-4 h-4" /></button>
    </div>
  );
}
