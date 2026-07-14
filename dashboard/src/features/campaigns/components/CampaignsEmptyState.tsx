import { Megaphone } from 'lucide-react';

export function CampaignsEmptyState() {
  return (
    <div className="card text-center py-10 text-gray-400"><Megaphone className="w-10 h-10 mx-auto mb-2 opacity-50" /><p>Chưa có chiến dịch nào</p></div>
  );
}
