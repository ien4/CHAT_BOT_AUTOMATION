import { HelpCircle } from 'lucide-react';

export function StaffGuide() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm">
      <h3 className="font-medium text-blue-800 flex items-center gap-1"><HelpCircle className="w-4 h-4" /> Hướng dẫn thêm nhân viên</h3>
      <ol className="mt-2 space-y-1 text-blue-700 list-decimal list-inside">
        <li>Nhân viên chat với bot Telegram (qua @BotFather đã tạo)</li>
        <li>Gõ lệnh <code className="bg-blue-100 px-1 rounded">/myid</code> để lấy Chat ID</li>
        <li>Sao chép Chat ID và nhập vào form dưới đây cùng với tên nhân viên</li>
        <li>Nhân viên có thể dùng lệnh <code className="bg-blue-100 px-1 rounded">/duty</code> để bật/tắt trực ban ngay trong Telegram</li>
      </ol>
    </div>
  );
}
