'use client';
import { useEffect, useState } from 'react';
import { analyticsApi } from '@/lib/api';
import { 
  BarChart3, MessageSquare, Users, Clock, Activity, 
  TrendingUp, TrendingDown, AlertTriangle, Smartphone, 
  Bot, PhoneCall, ChevronDown, ChevronUp, HelpCircle 
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Analytics {
  handoff: {
    total: number;
    active: number;
    pending: number;
    resolved: number;
    avgResponseTimeSeconds: number;
    staffResponseTimes: number[];
  };
  conversations: {
    avgDurationMinutes: number;
    botHandled: number;
    handoffHandled: number;
  };
  messages: {
    total: number;
    fallbackRate: number;
    fallbackCount: number;
    hourly: { hour: number; count: number }[];
    daily: { date: string; total: number; inbound: number; outbound: number }[];
  };
  intents: { intent: string; count: number }[];
}

const INTENT_LABELS: Record<string, string> = {
  company_info: '🏢 Thông tin CTY',
  service_inquiry: '🛠 Dịch vụ',
  content_package: '📦 Gói nội dung',
  general: '💬 Chung',
  fallback: '❓ Fallback',
  email_b2b: '📧 Email B2B',
  zalo_b2b: '💬 Zalo B2B',
};

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [showFallbackHelp, setShowFallbackHelp] = useState(false);

  useEffect(() => {
    loadData();
  }, [days]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: res } = await analyticsApi.get({ days });
      setData(res);
    } catch (e) {
      toast.error('Lỗi tải dữ liệu thống kê');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  if (loading) {
    return (
      <div className="flex justify-center h-64 items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-center py-10 text-gray-400">Không có dữ liệu</div>;
  }

  const intentColors: Record<string, string> = {
    company_info: 'bg-blue-500',
    service_inquiry: 'bg-green-500',
    content_package: 'bg-purple-500',
    general: 'bg-gray-500',
    fallback: 'bg-red-500',
    email_b2b: 'bg-yellow-500',
    zalo_b2b: 'bg-teal-500',
  };

  const totalIntents = data.intents.reduce((sum, i) => sum + i.count, 0);
  const handoffRate = data.conversations.botHandled + data.conversations.handoffHandled > 0
    ? (data.conversations.handoffHandled / (data.conversations.botHandled + data.conversations.handoffHandled) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">📊 Thống kê & Phân tích</h1>
          <p className="text-gray-500 text-sm mt-1">Phân tích hiệu suất bot, handoff, và tương tác người dùng</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Kỳ:</label>
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="input-field w-auto text-sm">
            <option value={7}>7 ngày</option>
            <option value={30}>30 ngày</option>
            <option value={90}>90 ngày</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bot vs Handoff */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">🤖 Bot vs 👤 Handoff</h2>
          <div className="flex items-end gap-4 h-40">
            <div className="flex-1 flex flex-col items-center">
              <div className="text-sm font-medium text-gray-600 mb-1">{data.conversations.botHandled}</div>
              <div 
                className="w-full bg-blue-500 rounded-t-lg transition-all" 
                style={{ height: `${Math.max(10, (data.conversations.botHandled / Math.max(1, data.conversations.botHandled + data.conversations.handoffHandled)) * 100)}%` }}
              />
              <div className="text-xs mt-2 font-medium">Bot xử lý</div>
            </div>
            <div className="flex-1 flex flex-col items-center">
              <div className="text-sm font-medium text-gray-600 mb-1">{data.conversations.handoffHandled}</div>
              <div 
                className="w-full bg-green-500 rounded-t-lg transition-all" 
                style={{ height: `${Math.max(10, (data.conversations.handoffHandled / Math.max(1, data.conversations.botHandled + data.conversations.handoffHandled)) * 100)}%` }}
              />
              <div className="text-xs mt-2 font-medium">Handoff</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-center text-sm">
            <div className="bg-blue-50 p-2 rounded">
              <span className="text-blue-700 font-medium">{data.conversations.botHandled}</span>
              <span className="text-blue-500"> cuộc ({100 - parseFloat(handoffRate)}%)</span>
            </div>
            <div className="bg-green-50 p-2 rounded">
              <span className="text-green-700 font-medium">{data.conversations.handoffHandled}</span>
              <span className="text-green-500"> cuộc ({handoffRate}%)</span>
            </div>
          </div>
        </div>

        {/* Intent Distribution */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">🎯 Intent Distribution</h2>
          <div className="space-y-3">
            {data.intents.length === 0 ? (
              <p className="text-gray-400 text-sm">Chưa có dữ liệu intent</p>
            ) : (
              data.intents.map(item => {
                const pct = totalIntents > 0 ? (item.count / totalIntents * 100) : 0;
                return (
                  <div key={item.intent}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{INTENT_LABELS[item.intent] || item.intent}</span>
                      <span className="text-gray-500">{item.count} ({pct.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${intentColors[item.intent] || 'bg-gray-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Staff Response Times */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-2">⏱ Staff Response Times</h2>
          <p className="text-xs text-gray-400 mb-4">Thời gian staff phản hồi (30 gần nhất)</p>
          <div className="text-center mb-4">
            <span className="text-3xl font-bold text-purple-600">{formatTime(data.handoff.avgResponseTimeSeconds)}</span>
            <span className="text-sm text-gray-500 ml-2">trung bình</span>
          </div>
          {data.handoff.staffResponseTimes.length > 0 ? (
            <div className="flex items-end gap-1 h-20">
              {data.handoff.staffResponseTimes.slice(0, 30).map((time, i) => {
                const maxTime = Math.max(...data.handoff.staffResponseTimes, 1);
                const isSlow = time > 60; // > 1 phút
                return (
                  <div 
                    key={i}
                    className={`flex-1 rounded-t ${isSlow ? 'bg-red-400' : 'bg-green-400'}`}
                    style={{ height: `${(time / maxTime) * 100}%` }}
                    title={`${time}s`}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-gray-400 text-sm text-center">Chưa có dữ liệu</p>
          )}
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>Gần đây</span>
            <span>Cũ hơn</span>
          </div>
        </div>

        {/* Hourly Activity */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">🕐 Hoạt động theo giờ</h2>
          {data.messages.hourly.length > 0 ? (
            <div className="flex items-end gap-1 h-32">
              {Array.from({ length: 24 }, (_, hour) => {
                const found = data.messages.hourly.find(h => h.hour === hour);
                const count = found?.count || 0;
                const maxCount = Math.max(...data.messages.hourly.map(h => h.count), 1);
                const isPeak = count === maxCount;
                return (
                  <div key={hour} className="flex-1 flex flex-col items-center">
                    <div 
                      className={`w-full rounded-t ${isPeak ? 'bg-yellow-500' : 'bg-blue-400'}`}
                      style={{ height: `${(count / maxCount) * 100}%` }}
                      title={`${hour}:00 - ${count} tin`}
                    />
                    {hour % 4 === 0 && <span className="text-[8px] text-gray-400 mt-0.5">{hour}h</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-400 text-sm text-center py-8">Chưa có dữ liệu</p>
          )}
        </div>

        {/* Daily Activity Chart */}
        <div className="card lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">📈 Tin nhắn theo ngày</h2>
          {data.messages.daily.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="flex items-end gap-2 h-40 min-w-[400px]">
                {data.messages.daily.map(day => {
                  const maxVal = Math.max(...data.messages.daily.map(d => d.total), 1);
                  const height = (day.total / maxVal) * 100;
                  return (
                    <div key={day.date} className="flex-1 flex flex-col items-center min-w-[30px]">
                      <div className="relative w-full flex flex-col items-center justify-end h-full">
                        <div 
                          className="w-full bg-blue-500 rounded-t"
                          style={{ height: `${height}%` }}
                          title={`${day.date}: ${day.total} tin`}
                        />
                      </div>
                      <span className="text-[8px] text-gray-400 mt-0.5 truncate max-w-full">
                        {new Date(day.date).toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-sm text-center py-8">Chưa có dữ liệu</p>
          )}
        </div>

        {/* Handoff Stats */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">🔀 Handoff Status</h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-yellow-50 p-3 rounded-lg">
              <p className="text-2xl font-bold text-yellow-600">{data.handoff.pending}</p>
              <p className="text-xs text-yellow-700">Chờ nhận</p>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{data.handoff.active}</p>
              <p className="text-xs text-green-700">Đang hỗ trợ</p>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{data.handoff.resolved}</p>
              <p className="text-xs text-blue-700">Đã kết thúc</p>
            </div>
          </div>
        </div>

        {/* Fallback Help */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">❓ Fallback Analysis</h2>
            <button onClick={() => setShowFallbackHelp(!showFallbackHelp)} className="text-gray-400 hover:text-gray-600">
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
          <div className="text-center mb-4">
            <span className={`text-3xl font-bold ${data.messages.fallbackRate > 15 ? 'text-red-600' : 'text-green-600'}`}>
              {data.messages.fallbackRate}%
            </span>
            <span className="text-sm text-gray-500 ml-2">tin nhắn fallback</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-4 mb-4">
            <div 
              className={`h-4 rounded-full ${data.messages.fallbackRate > 15 ? 'bg-red-500' : data.messages.fallbackRate > 8 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(data.messages.fallbackRate * 3, 100)}%` }}
            />
          </div>
          <p className="text-sm text-gray-600">
            {data.messages.fallbackRate > 15 
              ? '⚠️ Tỷ lệ fallback cao. Cần bổ sung thêm knowledge base cho các câu hỏi thường gặp.'
              : data.messages.fallbackRate > 8
                ? '📝 Tỷ lệ fallback ở mức trung bình. Có thể cải thiện bằng thêm knowledge.'
                : '✅ Tỷ lệ fallback thấp. Bot đang hoạt động tốt.'}
          </p>
          {showFallbackHelp && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
              <p><strong>Fallback</strong> là khi bot không xác định được intent của tin nhắn (tỉ lệ cao = cần thêm knowledge).</p>
              <p className="mt-1">Cách cải thiện: Thêm dữ liệu vào Knowledge Base với type=faq hoặc document.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
