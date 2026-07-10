import { MessageSquare, AlertTriangle, PhoneCall, Clock, Activity } from 'lucide-react';
import type { Analytics } from '../types';
import { formatTime, getHandoffRate } from '../lib/formatters';

// 5 thẻ tổng quan đầu trang — giữ nguyên layout/className/text.
export function AnalyticsSummaryCards({ data }: { data: Analytics }) {
  const handoffRate = getHandoffRate(data.conversations);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <div className="card">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50"><MessageSquare className="w-5 h-5 text-blue-600" /></div>
          <div>
            <p className="text-sm text-gray-500">Tổng tin nhắn</p>
            <p className="text-2xl font-bold">{data.messages.total.toLocaleString()}</p>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-50"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
          <div>
            <p className="text-sm text-gray-500">Fallback rate</p>
            <p className="text-2xl font-bold text-red-600">{data.messages.fallbackRate}%</p>
            <p className="text-xs text-gray-400">({data.messages.fallbackCount} tin)</p>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-50"><PhoneCall className="w-5 h-5 text-green-600" /></div>
          <div>
            <p className="text-sm text-gray-500">Handoff rate</p>
            <p className="text-2xl font-bold text-green-600">{handoffRate}%</p>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-50"><Clock className="w-5 h-5 text-purple-600" /></div>
          <div>
            <p className="text-sm text-gray-500">P/ứng staff TB</p>
            <p className="text-2xl font-bold">{formatTime(data.handoff.avgResponseTimeSeconds)}</p>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-yellow-50"><Activity className="w-5 h-5 text-yellow-600" /></div>
          <div>
            <p className="text-sm text-gray-500">TGian hội thoại</p>
            <p className="text-2xl font-bold">{data.conversations.avgDurationMinutes}m</p>
          </div>
        </div>
      </div>
    </div>
  );
}
