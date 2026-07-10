'use client';
import {
  useAnalytics,
  AnalyticsFilters,
  AnalyticsSummaryCards,
  BotVsHandoffCard,
  IntentDistributionCard,
  StaffResponseTimesCard,
  HourlyActivityCard,
  DailyActivityCard,
  HandoffStatusCard,
  FallbackAnalysisCard,
} from '@/features/analytics';

export default function AnalyticsPage() {
  const { data, loading, days, setDays } = useAnalytics(30);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">📊 Thống kê & Phân tích</h1>
          <p className="text-gray-500 text-sm mt-1">Phân tích hiệu suất bot, handoff, và tương tác người dùng</p>
        </div>
        <AnalyticsFilters days={days} onChange={setDays} />
      </div>

      {/* Summary Cards */}
      <AnalyticsSummaryCards data={data} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BotVsHandoffCard conversations={data.conversations} />
        <IntentDistributionCard intents={data.intents} />
        <StaffResponseTimesCard handoff={data.handoff} />
        <HourlyActivityCard hourly={data.messages.hourly} />
        <DailyActivityCard daily={data.messages.daily} />
        <HandoffStatusCard handoff={data.handoff} />
        <FallbackAnalysisCard messages={data.messages} />
      </div>
    </div>
  );
}
