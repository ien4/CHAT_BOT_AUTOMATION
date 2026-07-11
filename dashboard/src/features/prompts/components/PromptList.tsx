'use client';

import { Edit3, Trash2 } from 'lucide-react';
import type { PromptTemplate } from '../types';
import { intentLabel } from '../lib/promptFormatters';

export function PromptList({
  prompts,
  onEdit,
  onDelete,
}: {
  prompts: PromptTemplate[];
  onEdit: (prompt: PromptTemplate) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid gap-4">
      {prompts.map(t => (
        <div key={t.id} className="card">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h3 className="font-semibold">{t.name}</h3>
                {t.layer === 'identity' && <span className="badge badge-purple">🧠 Identity</span>}
                {t.layer === 'guardrails' && <span className="badge badge-yellow">🛡️ Guardrails</span>}
                {t.layer === 'intent' && <span className="badge badge-blue">{intentLabel(t.intentType)}</span>}
                {t.modelPreference && <span className="badge badge-gray">{t.modelPreference}</span>}
                {!t.isActive && <span className="badge badge-red">Inactive</span>}
              </div>
              {t.layer === 'identity' && (
                <div className="text-xs text-purple-600 bg-purple-50 p-2 rounded mb-2">
                  🧠 <strong>Bot Identity</strong> — Định nghĩa cá tính bot, load cho MỌI cuộc hội thoại. Tenant không có identity riêng sẽ dùng cái này.
                </div>
              )}
              {t.layer === 'guardrails' && (
                <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded mb-2">
                  🛡️ <strong>Guardrails</strong> — Quy tắc/giới hạn được append vào cuối system prompt, áp dụng cho MỌI cuộc hội thoại. Tenant không có guardrails riêng sẽ dùng cái này.
                </div>
              )}
              <div className="mt-3">
                <p className="text-xs font-medium text-gray-500 mb-1">System Prompt:</p>
                <pre className="text-xs bg-gray-50 p-2 rounded whitespace-pre-wrap max-h-[120px] overflow-y-auto">{t.systemPrompt}</pre>
              </div>
              {t.userPromptTemplate && t.layer === 'intent' && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-gray-500 mb-1">User Prompt:</p>
                  <pre className="text-xs bg-gray-50 p-2 rounded whitespace-pre-wrap max-h-[80px] overflow-y-auto">{t.userPromptTemplate}</pre>
                </div>
              )}
            </div>
            <div className="flex gap-1 ml-4">
              <button onClick={() => onEdit(t)} className="p-2 text-gray-400 hover:text-blue-600"><Edit3 className="w-4 h-4" /></button>
              <button onClick={() => onDelete(t.id)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
