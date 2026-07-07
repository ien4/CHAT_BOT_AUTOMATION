'use client';
import { useEffect, useState } from 'react';
import { statsApi } from '@/lib/api';
import {
  MessageSquare, Users, CalendarCheck, BookOpen, TrendingUp, Bot,
} from 'lucide-react';
import { format } from 'date-fns';

interface Stats {
  totalConversations: number;
  activeConversations: number;
  totalMessages: number;
  totalAppointments: number;
  pendingAppointments: number;
  knowledgeCount: number;
  messagesByDay: { date: string; count: number }[];
  intentDistribution: { intent: string; count: number }[];
}

const intentLabels: Record<string, string> = {
  company_info: 'Thông tin công ty',
  service_inquiry: 'Dịch vụ',
  content_package: 'Gói nội dung',
  campaign: 'Chiến dịch',
  general: 'Chung',
  fallback: 'Khác',
};

const intentColors: Record<string, string> = {
  company_info: 'bg-blue-500',
  service_inquiry: 'bg-green-500',
  content_package: 'bg-purple-500',
  campaign: 'bg-purple-500',
  general: 'bg-yellow-500',
  fallback: 'bg-gray-500',
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const { data } = await statsApi.get();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!stats) return <p>Không thể tải dữ liệu</p>;

  const cards = [
    { label: 'Tổng hội thoại', value: stats.totalConversations, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Đang hoạt động', value: stats.activeConversations, icon: MessageSquare, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Tin nhắn', value: stats.totalMessages, icon: Bot, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Lịch hẹn chờ', value: stats.pendingAppointments, icon: CalendarCheck, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Kiến thức', value: stats.knowledgeCount, icon: BookOpen, color: 'text-teal-600', bg: 'bg-teal-50' },
  ];

  const maxMessages = Math.max(...stats.messagesByDay.map(d => d.count), 1);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tổng quan</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="card">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${card.bg}`}>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-2xl font-bold">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Messages by day chart */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Tin nhắn 7 ngày qua
          </h2>
          <div className="flex items-end gap-2 h-48">
            {stats.messagesByDay.map((day) => (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs font-medium text-gray-600">{day.count}</span>
                <div
                  className="w-full bg-blue-500 rounded-t-md transition-all hover:bg-blue-600"
                  style={{ height: `${(day.count / maxMessages) * 140}px`, minHeight: '4px' }}
                />
                <span className="text-xs text-gray-400">
                  {format(new Date(day.date), 'dd/MM')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Intent distribution */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Phân bố ý định</h2>
          {stats.intentDistribution.length === 0 ? (
            <p className="text-gray-400 text-sm">Chưa có dữ liệu</p>
          ) : (
            <div className="space-y-4">
              {stats.intentDistribution.map((item) => {
                const total = stats.intentDistribution.reduce((s, i) => s + i.count, 0);
                const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0';
                return (
                  <div key={item.intent}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{intentLabels[item.intent] || item.intent}</span>
                      <span className="text-gray-500">{item.count} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${intentColors[item.intent] || 'bg-gray-500'}`}
                        style={{ width: `${Math.max(parseFloat(pct), 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}