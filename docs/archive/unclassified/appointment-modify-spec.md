# Spec: Sửa / Dời / Hủy lịch hẹn

> **Mục đích:** Hướng dẫn implement 2 tool mới để AI agent xử lý được các yêu cầu chỉnh sửa lịch hẹn từ khách hàng.

---

## 1. Hiện trạng

| Tool hiện có | Chức năng |
|---|---|
| `create_appointment` | Tạo lịch mới (yêu cầu tên, SĐT, ngày, giờ) |
| `check_appointment` | Tra lịch gần nhất của khách |
| `cancel_appointment` | Hủy lịch gần nhất (status → `cancelled`) |

**Thiếu:**
- Dời lịch (đổi ngày/giờ) → không có tool riêng, chỉ có thể hủy + đặt lại (flow bị gián đoạn)
- Sửa thông tin sai (tên, SĐT) → không làm được gì sau khi đã xác nhận

---

## 2. Cần thêm 2 tool

### Tool 1: `reschedule_appointment`

Đổi ngày/giờ của lịch hẹn hiện tại mà **không cần hủy và đặt lại**.

**Input:**

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `new_date` | string | ✅ | Ngày mới, định dạng `YYYY-MM-DD` |
| `new_time` | string | ✅ | Giờ mới, định dạng `HH:MM` |
| `reason` | string | ❌ | Lý do dời (ghi vào notes) |

**Logic:**
1. Tìm lịch hẹn gần nhất của `fbUserId` có status `pending` hoặc `confirmed`
2. Nếu không tìm thấy → trả về lỗi
3. Kiểm tra dedup: nếu `new_date` trùng với lịch khác của cùng user đang active → trả về lỗi
4. Update `date`, `time`, append vào `notes`: `| Dời lịch: {old_date} {old_time} → {new_date} {new_time}`
5. Gửi Telegram thông báo dời lịch
6. Trả về success với thông tin mới

**Output (success):**
```json
{
  "success": true,
  "message": "Đã dời lịch từ 2025-06-10 09:00 sang 2025-06-13 14:00",
  "old": { "date": "2025-06-10", "time": "09:00" },
  "new": { "date": "2025-06-13", "time": "14:00" }
}
```

**Output (không tìm thấy lịch):**
```json
{
  "success": false,
  "message": "Không tìm thấy lịch hẹn nào đang active để dời."
}
```

**Output (trùng ngày):**
```json
{
  "success": false,
  "message": "Ngày 2025-06-13 đã có lịch hẹn lúc 10:00. Vui lòng chọn ngày/giờ khác."
}
```

---

### Tool 2: `update_appointment`

Sửa thông tin cá nhân bị nhập sai (tên, số điện thoại).

**Input:**

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `name` | string | ❌ | Tên mới (chỉ truyền nếu cần sửa) |
| `phone` | string | ❌ | SĐT mới (chỉ truyền nếu cần sửa) |

> Ít nhất 1 trong 2 phải có.

**Logic:**
1. Tìm lịch hẹn gần nhất của `fbUserId` có status `pending` hoặc `confirmed`
2. Nếu không tìm thấy → trả về lỗi
3. Chỉ update field nào được truyền vào (partial update)
4. Nếu `name` thay đổi → cũng update `fbUserName` trên bản ghi appointment
5. Trả về success với thông tin đã sửa

**Output (success):**
```json
{
  "success": true,
  "message": "Đã cập nhật thông tin lịch hẹn: SĐT → 0912345678"
}
```

---

## 3. Implementation — `tools.js`

### 3a. Thêm vào `CLAUDE_TOOLS` array

```js
{
  name: 'reschedule_appointment',
  description:
    'Dời lịch hẹn của khách sang ngày/giờ mới. ' +
    'Dùng khi khách muốn đổi ngày hoặc giờ nhưng không muốn hủy. ' +
    'Thu thập ngày mới VÀ giờ mới trước khi gọi. ' +
    'Xác nhận với khách một lần trước khi thực hiện.',
  input_schema: {
    type: 'object',
    properties: {
      new_date: { type: 'string', description: 'Ngày mới định dạng YYYY-MM-DD' },
      new_time: { type: 'string', description: 'Giờ mới định dạng HH:MM' },
      reason:   { type: 'string', description: 'Lý do dời lịch (tuỳ chọn)' },
    },
    required: ['new_date', 'new_time'],
  },
},
{
  name: 'update_appointment',
  description:
    'Sửa thông tin cá nhân (tên, số điện thoại) của lịch hẹn hiện tại. ' +
    'Dùng khi khách báo nhập sai tên hoặc số điện thoại. ' +
    'Chỉ truyền field nào cần sửa.',
  input_schema: {
    type: 'object',
    properties: {
      name:  { type: 'string', description: 'Tên mới (nếu cần sửa)' },
      phone: { type: 'string', description: 'Số điện thoại mới (nếu cần sửa)' },
    },
  },
},
```

### 3b. Thêm vào `executeTool()` switch-case

Thêm sau `case 'cancel_appointment':` và trước `case 'search_knowledge':`:

```js
case 'reschedule_appointment': {
  const { new_date, new_time, reason } = input;

  const active = await prisma.appointment.findFirst({
    where: {
      fbUserId: conversation.fbUserId,
      status: { in: ['pending', 'confirmed'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!active) {
    return { success: false, message: 'Không tìm thấy lịch hẹn nào đang active để dời.' };
  }

  // Dedup: kiểm tra new_date có trùng lịch khác không
  if (new_date && new_date !== active.date) {
    const conflict = await prisma.appointment.findFirst({
      where: {
        fbUserId: conversation.fbUserId,
        date: new_date,
        status: { in: ['pending', 'confirmed'] },
        id: { not: active.id },
      },
    });
    if (conflict) {
      return {
        success: false,
        message: `Ngày ${new_date} đã có lịch hẹn lúc ${conflict.time}. Vui lòng chọn ngày/giờ khác.`,
      };
    }
  }

  const oldDate = active.date;
  const oldTime = active.time;
  const noteAppend = reason
    ? ` | Dời lịch: ${oldDate} ${oldTime} → ${new_date} ${new_time} (${reason})`
    : ` | Dời lịch: ${oldDate} ${oldTime} → ${new_date} ${new_time}`;

  await prisma.appointment.update({
    where: { id: active.id },
    data: {
      date: new_date,
      time: new_time,
      notes: `${active.notes || ''}${noteAppend}`.trim(),
    },
  });

  // Telegram notification
  try {
    const manager = require('../notifications/telegramManager');
    const formatters = require('../notifications/formatters');
    await manager.send(
      formatters.appointmentRescheduled
        ? formatters.appointmentRescheduled(active.fbUserName, oldDate, oldTime, new_date, new_time)
        : `📅 Dời lịch hẹn\n👤 ${active.fbUserName}\n📞 ${active.phone}\n⏮ Cũ: ${oldDate} ${oldTime}\n⏭ Mới: ${new_date} ${new_time}`
    );
  } catch (_) { /* non-critical */ }

  return {
    success: true,
    message: `Đã dời lịch từ ${oldDate} ${oldTime} sang ${new_date} ${new_time}.`,
    old: { date: oldDate, time: oldTime },
    new: { date: new_date, time: new_time },
  };
}

case 'update_appointment': {
  const { name, phone } = input;

  if (!name && !phone) {
    return { success: false, message: 'Vui lòng cung cấp ít nhất tên hoặc số điện thoại cần sửa.' };
  }

  const active = await prisma.appointment.findFirst({
    where: {
      fbUserId: conversation.fbUserId,
      status: { in: ['pending', 'confirmed'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!active) {
    return { success: false, message: 'Không tìm thấy lịch hẹn nào đang active để cập nhật.' };
  }

  const updateData = {};
  const changes = [];
  if (name)  { updateData.fbUserName = name;  changes.push(`Tên → ${name}`); }
  if (phone) { updateData.phone = phone;       changes.push(`SĐT → ${phone}`); }

  await prisma.appointment.update({
    where: { id: active.id },
    data: updateData,
  });

  return {
    success: true,
    message: `Đã cập nhật thông tin lịch hẹn: ${changes.join(', ')}.`,
  };
}
```

---

## 4. Cập nhật System Prompt — `agent.js`

Trong hàm `buildSystemPrompt()`, thêm 2 dòng mô tả tool mới vào phần danh sách tools:

```
- **reschedule_appointment**: dùng khi khách muốn dời/đổi ngày hoặc giờ — hỏi ngày mới VÀ giờ mới, xác nhận trước khi gọi
- **update_appointment**: dùng khi khách báo nhập sai tên hoặc số điện thoại
```

Và thêm nguyên tắc:

```
- Khi khách muốn "sửa lịch", "đổi ngày", "dời sang ngày khác" → dùng reschedule_appointment, KHÔNG hủy rồi đặt lại
- Khi khách muốn hủy hoàn toàn → mới dùng cancel_appointment
```

---

## 5. Thêm Telegram formatter (tùy chọn)

Trong `backend/src/notifications/formatters.js`, thêm function:

```js
appointmentRescheduled(name, oldDate, oldTime, newDate, newTime) {
  return (
    `📅 *Dời lịch hẹn*\n` +
    `👤 ${name}\n` +
    `⏮ Cũ: ${oldDate} lúc ${oldTime}\n` +
    `⏭ Mới: ${newDate} lúc ${newTime}`
  );
},
```

---

## 6. Migration DB

**Không cần migration.** Schema `Appointment` hiện tại đã đủ:
- `date`, `time` → cập nhật trực tiếp khi dời lịch
- `fbUserName`, `phone` → cập nhật trực tiếp khi sửa thông tin
- `notes` → dùng để ghi log lịch sử thay đổi (append)
- `status` → không đổi khi dời/sửa, chỉ đổi khi hủy

---

## 7. Test cases

| Scenario | Tool gọi | Expected |
|---|---|---|
| Khách: "cho tôi dời sang thứ 6 tuần này lúc 3 giờ chiều" | `reschedule_appointment` | Update date+time, notify Telegram |
| Khách: "tôi nhập sai số điện thoại, số đúng là 0912..." | `update_appointment` | Update phone |
| Khách: "hủy giúp tôi" | `cancel_appointment` | Status → cancelled |
| Dời sang ngày đã có lịch khác | `reschedule_appointment` | Trả về lỗi conflict |
| Dời khi không có lịch nào | `reschedule_appointment` | Trả về lỗi not found |
| Gọi `update_appointment` không truyền gì | - | Trả về lỗi validation |

---

## 8. Thứ tự implement

1. Thêm 2 tool vào `CLAUDE_TOOLS` và `executeTool()` trong `tools.js`
2. Cập nhật system prompt trong `agent.js`  
3. (Tùy chọn) Thêm `appointmentRescheduled` vào `formatters.js`
4. Test thủ công qua chat

> `OPENAI_TOOLS` được tự động generate từ `CLAUDE_TOOLS` bằng `.map()` ở dòng 74 trong `tools.js` — không cần sửa thêm.
