// Kiểu dữ liệu cho analytics dashboard — giữ nguyên shape trả về từ GET /api/analytics.
export interface Analytics {
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
