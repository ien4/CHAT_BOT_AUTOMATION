import { Plus } from 'lucide-react';

interface CampaignsHeaderProps {
  onCreate: () => void;
}

export function CampaignsHeader({ onCreate }: CampaignsHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold">Chiến dịch</h1>
      <button onClick={onCreate} className="btn-primary flex items-center gap-1"><Plus className="w-4 h-4" /> Thêm</button>
    </div>
  );
}
