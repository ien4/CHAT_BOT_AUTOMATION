'use client';

import type { FormEvent } from 'react';
import type { PromptTemplate } from '../types';

export function PromptForm({
  show,
  editing,
  name,
  intentType,
  layer,
  systemPrompt,
  userPromptTemplate,
  modelPreference,
  submitting,
  isLayerFixed,
  onNameChange,
  onIntentTypeChange,
  onLayerChange,
  onSystemPromptChange,
  onUserPromptTemplateChange,
  onModelPreferenceChange,
  onSubmit,
  onCancel,
}: {
  show: boolean;
  editing: PromptTemplate | null;
  name: string;
  intentType: string;
  layer: string;
  systemPrompt: string;
  userPromptTemplate: string;
  modelPreference: string;
  submitting: boolean;
  isLayerFixed: boolean;
  onNameChange: (value: string) => void;
  onIntentTypeChange: (value: string) => void;
  onLayerChange: (value: string) => void;
  onSystemPromptChange: (value: string) => void;
  onUserPromptTemplateChange: (value: string) => void;
  onModelPreferenceChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold">{editing ? 'Sửa prompt' : 'Thêm prompt'}</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Tên</label>
              <input value={name} onChange={e => onNameChange(e.target.value)} className="input-field" placeholder="Tên template" required />
            </div>
            <div>
              <label className="text-sm font-medium">Tầng (Layer)</label>
              <select value={layer} onChange={e => onLayerChange(e.target.value)} className="input-field">
                <option value="identity">🧠 Identity (cá tính bot)</option>
                <option value="guardrails">🛡️ Guardrails (quy tắc/giới hạn)</option>
                <option value="intent">🎯 Intent (hành vi theo intent)</option>
              </select>
              <p className="text-xs text-gray-400 mt-0.5">
                {layer === 'identity' && 'Load cho MỌI cuộc hội thoại, định nghĩa cá tính bot'}
                {layer === 'guardrails' && 'Append vào cuối system prompt, áp dụng cho MỌI cuộc hội thoại'}
                {layer === 'intent' && 'Per-intent behavioral hint, chỉ load khi detect đúng intent'}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Loại intent</label>
              <select
                value={intentType}
                onChange={e => onIntentTypeChange(e.target.value)}
                className="input-field"
                disabled={isLayerFixed}
              >
                <optgroup label="Chatbot">
                  <option value="company_info">Thông tin công ty</option>
                  <option value="service_inquiry">Dịch vụ</option>
                  <option value="content_package">Gói nội dung</option>
                  <option value="campaign">Chiến dịch</option>
                  <option value="general">Chung</option>
                  <option value="fallback">Fallback</option>
                </optgroup>
                <optgroup label="B2B Outreach">
                  <option value="email_b2b">Email B2B</option>
                  <option value="zalo_b2b">Zalo B2B</option>
                </optgroup>
              </select>
              {isLayerFixed && (
                <p className="text-xs text-gray-400 mt-0.5">Không áp dụng cho layer này</p>
              )}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Model (tùy chọn)</label>
            <input value={modelPreference} onChange={e => onModelPreferenceChange(e.target.value)} className="input-field" placeholder="gemini-2.0-flash" />
          </div>
          <div>
            <label className="text-sm font-medium">System Prompt</label>
            {layer === 'guardrails' && (
              <p className="text-xs text-amber-600 mb-1">
                Nội dung này sẽ được append vào cuối system prompt. Viết các quy tắc/giới hạn cho bot (ví dụ: không nói về chủ đề X, luôn giới thiệu sản phẩm Y khi có cơ hội...).
              </p>
            )}
            <textarea
              value={systemPrompt}
              onChange={e => onSystemPromptChange(e.target.value)}
              className="input-field min-h-[120px] font-mono text-sm"
              placeholder={
                layer === 'guardrails'
                  ? 'Ví dụ:\n- Không đề cập đến đối thủ cạnh tranh\n- Luôn mời khách đặt lịch tư vấn miễn phí\n- Không báo giá cụ thể, chuyển sang gặp tư vấn viên'
                  : 'System prompt với placeholders {{KNOWLEDGE_CONTEXT}}, {{WEBSITE_ANALYSIS}}, {{CAMPAIGN_CONTEXT}}'
              }
              required
            />
          </div>
          {layer === 'intent' && (
            <div>
              <label className="text-sm font-medium">User Prompt Template</label>
              <textarea value={userPromptTemplate} onChange={e => onUserPromptTemplateChange(e.target.value)} className="input-field min-h-[80px] font-mono text-sm" placeholder="User prompt với {{USER_MESSAGE}}, {{CONVERSATION_HISTORY}}" />
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onCancel} className="btn-secondary">Hủy</button>
            <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Lưu...' : 'Lưu'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
