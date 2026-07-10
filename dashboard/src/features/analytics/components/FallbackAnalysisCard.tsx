'use client';
import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import type { Analytics } from '../types';

// Phân tích fallback (có toggle help) — giữ nguyên JSX/className/text + state cục bộ.
export function FallbackAnalysisCard({ messages }: { messages: Analytics['messages'] }) {
  const [showFallbackHelp, setShowFallbackHelp] = useState(false);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">❓ Fallback Analysis</h2>
        <button onClick={() => setShowFallbackHelp(!showFallbackHelp)} className="text-gray-400 hover:text-gray-600">
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
      <div className="text-center mb-4">
        <span className={`text-3xl font-bold ${messages.fallbackRate > 15 ? 'text-red-600' : 'text-green-600'}`}>
          {messages.fallbackRate}%
        </span>
        <span className="text-sm text-gray-500 ml-2">tin nhắn fallback</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-4 mb-4">
        <div
          className={`h-4 rounded-full ${messages.fallbackRate > 15 ? 'bg-red-500' : messages.fallbackRate > 8 ? 'bg-yellow-500' : 'bg-green-500'}`}
          style={{ width: `${Math.min(messages.fallbackRate * 3, 100)}%` }}
        />
      </div>
      <p className="text-sm text-gray-600">
        {messages.fallbackRate > 15
          ? '⚠️ Tỷ lệ fallback cao. Cần bổ sung thêm knowledge base cho các câu hỏi thường gặp.'
          : messages.fallbackRate > 8
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
  );
}
