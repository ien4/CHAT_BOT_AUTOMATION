'use client';
import { useEffect, useState } from 'react';
import { conversationsApi } from '@/lib/api';
import { format } from 'date-fns';
import { MessageSquare, Search, ChevronRight } from 'lucide-react';

interface Conversation {
  id: string;
  fbUserId: string;
  fbUserName: string;
  status: string;
  updatedAt: string;
  _count: { messages: number };
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    loadConversations();
  }, [page, statusFilter]);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      const { data } = await conversationsApi.list(params);
      setConversations(data.data);
      setTotalPages(data.pagination.pages);
    } catch (error) {
      console.error('Failed to load:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (chatId: string) => {
    setActiveChat(chatId);
    try {
      const { data } = await conversationsApi.messages(chatId);
      setMessages(data);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: 'badge-green',
      appointment_booked: 'badge-blue',
      closed: 'badge-gray',
    };
    const labels: Record<string, string> = {
      active: 'Hoạt động',
      appointment_booked: 'Đã đặt lịch',
      closed: 'Đã đóng',
    };
    return <span className={`badge ${map[status] || 'badge-gray'}`}>{labels[status] || status}</span>;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Hội thoại</h1>

      {/* Filters */}
      <div className="flex gap-2">
        {['', 'active', 'appointment_booked', 'closed'].map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === '' ? 'Tất cả' : s === 'active' ? 'Hoạt động' : s === 'appointment_booked' ? 'Đã đặt lịch' : 'Đã đóng'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Conversation list */}
        <div className="card lg:col-span-1 p-0 max-h-[600px] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>Chưa có hội thoại nào</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadMessages(conv.id)}
                className={`w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  activeChat === conv.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{conv.fbUserName || 'Người dùng'}</p>
                    <p className="text-xs text-gray-500">{conv._count.messages} tin nhắn</p>
                  </div>
                  <div className="text-right">
                    {statusBadge(conv.status)}
                    <p className="text-xs text-gray-400 mt-1">
                      {format(new Date(conv.updatedAt), 'dd/MM HH:mm')}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 p-3">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary text-xs"
              >Trước</button>
              <span className="text-sm text-gray-500 py-1">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary text-xs"
              >Sau</button>
            </div>
          )}
        </div>

        {/* Message view */}
        <div className="card lg:col-span-2 max-h-[600px] overflow-y-auto">
          {!activeChat ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 py-20">
              <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
              <p>Chọn một hội thoại để xem</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10 text-gray-400">Chưa có tin nhắn</div>
          ) : (
                        <div className="space-y-3">
              {messages.map((msg: any) => {
                // staff_outbound hiển thị giống outbound (bên phải, màu xanh)
                const isOutbound = msg.direction === 'outbound' || msg.direction === 'staff_outbound';
                // Hiển thị tên người gửi cho staff
                const senderLabel = msg.direction === 'staff_outbound'
                  ? (msg.metadata?.staffName || 'Nhân viên')
                  : null;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                      isOutbound
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}>
                      {senderLabel && (
                        <p className="text-xs font-semibold opacity-80 mb-1">{senderLabel}</p>
                      )}
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <div className={`flex items-center gap-2 mt-1 ${
                        isOutbound ? 'text-blue-200' : 'text-gray-400'
                      }`}>
                        <span className="text-xs">
                          {format(new Date(msg.createdAt), 'HH:mm')}
                        </span>
                        {msg.intent && (
                          <span className="text-xs opacity-75">{msg.intent}</span>
                        )}
                      </div>
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