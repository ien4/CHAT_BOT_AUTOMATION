const getPrisma = require('../db');
const prisma = getPrisma();
const ragPipeline = require('../rag/pipeline');
const appointmentNotifications = require('../notifications/appointments');
const alertQueue = require('../notifications/alertQueue');
const formatters = require('../notifications/formatters');

// In-memory streak tracker: conversationId → { count, lastMissAt }
const ragMissStreaks = new Map();
const RAG_MISS_ALERT_THRESHOLD = 3;

setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, entry] of ragMissStreaks.entries()) {
    if (entry.lastMissAt < cutoff) ragMissStreaks.delete(id);
  }
}, 10 * 60 * 1000);

// ==================== TOOL DEFINITIONS ====================

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function findPackageFromRecentConversation(conversationId, packages) {
  if (!conversationId) return null;

  const recentMessages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: { content: true },
  });

  const recentText = normalizeSearchText(recentMessages.map((m) => m.content).join(' '));
  return packages.find((pkg) => {
    const name = normalizeSearchText(pkg.name);
    const description = normalizeSearchText(pkg.description);
    return (name && recentText.includes(name)) || (description && recentText.includes(description));
  }) || null;
}

function isListContentPackageQuery(query) {
  const q = normalizeSearchText(query);
  const asksContent = q.includes('prompt') || q.includes('tai lieu') || q.includes('template');
  const asksList = q.includes('tat ca') || q.includes('nhung') || q.includes('danh sach') || q.includes('co gi');
  return asksContent && asksList;
}

function getRequiredAppointmentTenantId(context) {
  const contextTenantId = context?.tenantId || null;
  const conversationTenantId = context?.conversation?.tenantId || null;

  if (contextTenantId && conversationTenantId && contextTenantId !== conversationTenantId) {
    return { ok: false, reason: 'tenant_context_mismatch' };
  }

  const tenantId = contextTenantId || conversationTenantId;
  if (!tenantId) {
    return { ok: false, reason: 'missing_tenant_context' };
  }

  return { ok: true, tenantId };
}

function buildAppointmentOwnerWhere(context, fbUserId) {
  const scope = getRequiredAppointmentTenantId(context);
  if (!scope.ok) return scope;

  return {
    ok: true,
    tenantId: scope.tenantId,
    where: {
      fbUserId,
      tenantId: scope.tenantId,
    },
  };
}

function appointmentTenantScopeError() {
  return {
    success: false,
    found: false,
    message: 'Khong the xu ly lich hen do thieu ngu canh tenant hop le.',
  };
}

// Claude (Anthropic) format
const CLAUDE_TOOLS = [
  {
    name: 'create_appointment',
    description:
      'Lưu lịch hẹn tư vấn vào hệ thống. ' +
      'CHỈ gọi tool này sau khi đã thu thập ĐẦY ĐỦ 4 thông tin: tên khách hàng, số điện thoại, ngày hẹn (YYYY-MM-DD), giờ hẹn (HH:MM). ' +
      'Hỏi lần lượt nếu thiếu thông tin. Không tự bịa thông tin.',
    input_schema: {
      type: 'object',
      properties: {
        name:  { type: 'string', description: 'Tên khách hàng' },
        phone: { type: 'string', description: 'Số điện thoại' },
        date:  { type: 'string', description: 'Ngày hẹn định dạng YYYY-MM-DD' },
        time:  { type: 'string', description: 'Giờ hẹn định dạng HH:MM' },
        notes: { type: 'string', description: 'Ghi chú thêm (tuỳ chọn)' },
      },
      required: ['name', 'phone', 'date', 'time'],
    },
  },
  {
    name: 'check_appointment',
    description: 'Kiểm tra xem khách hàng đã có lịch hẹn nào trong hệ thống chưa.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'cancel_appointment',
    description: 'Hủy lịch hẹn gần nhất của khách hàng (đang pending hoặc confirmed).',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Lý do hủy (tuỳ chọn)' },
      },
    },
  },
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
        reason: { type: 'string', description: 'Lý do dời lịch (tuỳ chọn)' },
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
        name: { type: 'string', description: 'Tên mới (nếu cần sửa)' },
        phone: { type: 'string', description: 'Số điện thoại mới (nếu cần sửa)' },
      },
    },
  },
  {
    name: 'search_knowledge',
    description:
      'Tìm kiếm thông tin về dịch vụ, công ty, giá cả, chính sách trong cơ sở kiến thức. ' +
      'Dùng khi khách hỏi về dịch vụ, thông tin công ty, giá, hoặc bất cứ thông tin nào bạn chưa biết.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Câu hỏi hoặc từ khóa cần tìm' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_content_package',
    description:
      'Lấy tài liệu, prompt hình ảnh, nội dung marketing, mẫu content từ kho gói nội dung. ' +
      'Dùng khi khách hỏi về prompt, template, tài liệu, hoặc nội dung cụ thể.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Tên gói, loại nội dung, hoặc từ khóa' },
      },
      required: ['query'],
    },
  },
];

// OpenAI / DeepSeek format (converted from CLAUDE_TOOLS)
const OPENAI_TOOLS = CLAUDE_TOOLS.map((t) => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  },
}));

// ==================== TOOL IMPLEMENTATIONS ====================

async function executeTool(toolName, input, context) {
  const { conversation } = context;

  switch (toolName) {
    case 'create_appointment': {
      const { name, phone, date, time, notes } = input;
      const ownerScope = buildAppointmentOwnerWhere(context, conversation.fbUserId);
      if (!ownerScope.ok) return appointmentTenantScopeError();

      // Dedup: don't create if same user+date already has active appointment
      if (date) {
        const existing = await prisma.appointment.findFirst({
          where: {
            ...ownerScope.where,
            date,
            status: { in: ['pending', 'confirmed'] },
          },
        });
        if (existing) {
          const label = existing.status === 'confirmed' ? 'đã xác nhận' : 'chờ xác nhận';
          return {
            success: false,
            message: `Khách đã có lịch hẹn ngày ${date} lúc ${existing.time} (${label}). Không tạo thêm.`,
          };
        }
      }

      const appointment = await prisma.appointment.create({
        data: {
          conversationId: conversation.id,
          fbUserId: conversation.fbUserId,
          fbUserName: name,
          date,
          time,
          phone,
          status: 'pending',
          notes: notes || 'Đặt qua AI agent',
          tenantId: ownerScope.tenantId,
        },
      });

      await prisma.conversation.updateMany({
        where: { id: conversation.id, tenantId: ownerScope.tenantId },
        data: { status: 'appointment_booked' },
      });

      await appointmentNotifications.booked(appointment).catch(() => {});

      return {
        success: true,
        message: `Đã lưu lịch hẹn: ${name} | ${date} ${time} | SĐT: ${phone}`,
      };
    }

    case 'check_appointment': {
      const ownerScope = buildAppointmentOwnerWhere(context, conversation.fbUserId);
      if (!ownerScope.ok) return appointmentTenantScopeError();

      const active = await prisma.appointment.findFirst({
        where: {
          ...ownerScope.where,
          status: { in: ['pending', 'confirmed'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (active) {
        return {
          found: true,
          appointment: {
            name: active.fbUserName,
            date: active.date,
            time: active.time,
            phone: active.phone,
            status: active.status,
          },
        };
      }

      const cancelled = await prisma.appointment.findFirst({
        where: { ...ownerScope.where, status: 'cancelled' },
        orderBy: { createdAt: 'desc' },
      });

      if (cancelled) {
        return {
          found: false,
          cancelled: true,
          message: `Lịch hẹn ngày ${cancelled.date} lúc ${cancelled.time} đã bị hủy trước đó.`,
        };
      }

      return { found: false, message: 'Không tìm thấy lịch hẹn nào trong hệ thống.' };
    }

    case 'cancel_appointment': {
      const ownerScope = buildAppointmentOwnerWhere(context, conversation.fbUserId);
      if (!ownerScope.ok) return appointmentTenantScopeError();

      const active = await prisma.appointment.findFirst({
        where: {
          ...ownerScope.where,
          status: { in: ['pending', 'confirmed'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!active) {
        return { success: false, message: 'Không tìm thấy lịch hẹn nào để hủy.' };
      }

      const reason = input.reason || 'Khách yêu cầu hủy';
      const updateResult = await prisma.appointment.updateMany({
        where: {
          id: active.id,
          ...ownerScope.where,
          status: { in: ['pending', 'confirmed'] },
        },
        data: {
          status: 'cancelled',
          notes: `${active.notes || ''} | Hủy: ${reason}`.trim(),
        },
      });
      if (updateResult.count === 0) {
        return { success: false, message: 'Khong tim thay lich hen hop le de huy.' };
      }
      const appointment = await prisma.appointment.findFirst({
        where: { id: active.id, ...ownerScope.where },
      });
      await appointmentNotifications.cancelled(appointment, reason).catch(() => {});

      return {
        success: true,
        message: `Đã hủy lịch hẹn ngày ${active.date} lúc ${active.time}.`,
      };
    }

    case 'reschedule_appointment': {
      const { new_date, new_time, reason } = input;
      const ownerScope = buildAppointmentOwnerWhere(context, conversation.fbUserId);
      if (!ownerScope.ok) return appointmentTenantScopeError();

      if (!new_date || !new_time) {
        return { success: false, message: 'Vui lòng cung cấp đầy đủ ngày mới và giờ mới để dời lịch.' };
      }

      const active = await prisma.appointment.findFirst({
        where: {
          ...ownerScope.where,
          status: { in: ['pending', 'confirmed'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!active) {
        return { success: false, message: 'Không tìm thấy lịch hẹn nào đang active để dời.' };
      }

      const conflict = await prisma.appointment.findFirst({
        where: {
          ...ownerScope.where,
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

      const oldDate = active.date;
      const oldTime = active.time;
      const noteAppend = reason
        ? ` | Dời lịch: ${oldDate} ${oldTime} -> ${new_date} ${new_time} (${reason})`
        : ` | Dời lịch: ${oldDate} ${oldTime} -> ${new_date} ${new_time}`;

      const updateResult = await prisma.appointment.updateMany({
        where: {
          id: active.id,
          ...ownerScope.where,
          status: { in: ['pending', 'confirmed'] },
        },
        data: {
          date: new_date,
          time: new_time,
          notes: `${active.notes || ''}${noteAppend}`.trim(),
        },
      });
      if (updateResult.count === 0) {
        return { success: false, message: 'Khong tim thay lich hen hop le de doi lich.' };
      }
      const appointment = await prisma.appointment.findFirst({
        where: { id: active.id, ...ownerScope.where },
      });

      await appointmentNotifications.rescheduled(appointment, oldDate, oldTime).catch(() => {});

      return {
        success: true,
        message: `Đã dời lịch từ ${oldDate} ${oldTime} sang ${new_date} ${new_time}.`,
        old: { date: oldDate, time: oldTime },
        new: { date: new_date, time: new_time },
      };
    }

    case 'update_appointment': {
      const name = typeof input.name === 'string' ? input.name.trim() : input.name;
      const phone = typeof input.phone === 'string' ? input.phone.trim() : input.phone;
      const ownerScope = buildAppointmentOwnerWhere(context, conversation.fbUserId);
      if (!ownerScope.ok) return appointmentTenantScopeError();

      if (!name && !phone) {
        return { success: false, message: 'Vui lòng cung cấp ít nhất tên hoặc số điện thoại cần sửa.' };
      }

      const active = await prisma.appointment.findFirst({
        where: {
          ...ownerScope.where,
          status: { in: ['pending', 'confirmed'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!active) {
        return { success: false, message: 'Không tìm thấy lịch hẹn nào đang active để cập nhật.' };
      }

      const updateData = {};
      const changes = [];
      if (name) {
        updateData.fbUserName = name;
        changes.push(`Tên -> ${name}`);
      }
      if (phone) {
        updateData.phone = phone;
        changes.push(`SĐT -> ${phone}`);
      }

      const updateResult = await prisma.appointment.updateMany({
        where: {
          id: active.id,
          ...ownerScope.where,
          status: { in: ['pending', 'confirmed'] },
        },
        data: updateData,
      });
      if (updateResult.count === 0) {
        return { success: false, message: 'Khong tim thay lich hen hop le de cap nhat.' };
      }
      const appointment = await prisma.appointment.findFirst({
        where: { id: active.id, ...ownerScope.where },
      });
      await appointmentNotifications.updated(appointment, changes).catch(() => {});

      return {
        success: true,
        message: `Đã cập nhật thông tin lịch hẹn: ${changes.join(', ')}.`,
      };
    }

    case 'search_knowledge': {
      const { query } = input;
      try {
        const tagFilter = context.knowledgeFilter || [];
        const results = await ragPipeline.search(query, 'general', tagFilter, context.tenantId || null);
        const content = ragPipeline.formatContext(results);
        if (!content || content === 'Không tìm thấy thông tin liên quan.') {
          const convId = conversation.id;
          const entry = ragMissStreaks.get(convId) || { count: 0, lastMissAt: 0 };
          entry.count += 1;
          entry.lastMissAt = Date.now();
          ragMissStreaks.set(convId, entry);

          if (entry.count >= RAG_MISS_ALERT_THRESHOLD) {
            const customerName = conversation.fbUserName || conversation.fbUserId;
            alertQueue.alert(
              `rag_miss_${convId}`,
              formatters.ragMissStreak(customerName, entry.count)
            ).catch(() => {});
          }

          return { found: false, content: 'Không tìm thấy thông tin liên quan trong cơ sở kiến thức.' };
        }
        ragMissStreaks.delete(conversation.id);
        return { found: true, content };
      } catch (e) {
        return { found: false, content: 'Lỗi khi tìm kiếm kiến thức: ' + e.message };
      }
    }

    case 'get_content_package': {
      const { query } = input;
      try {
        const tenantId = context.tenantId || null;
        const packages = await prisma.contentPackage.findMany({
          where: {
            isActive: true,
            isPublic: true,
            // global luôn hiển thị; nếu có tenantId thì thêm tenant-specific
            ...(tenantId
              ? { OR: [{ tenantId }, { tenantId: null }] }
              : { tenantId: null }),
          },
          include: { items: { orderBy: { order: 'asc' } } },
          orderBy: { createdAt: 'desc' },
        });

        if (packages.length === 0) {
          return { found: false, content: 'Hiện chưa có gói nội dung nào.' };
        }

        const q = normalizeSearchText(query);
        const matched = [];
        for (const pkg of packages) {
          const packageText = normalizeSearchText([pkg.name, pkg.description].filter(Boolean).join(' '));
          const packageMatches = q && (packageText.includes(q) || q.includes(packageText));
          for (const item of pkg.items || []) {
            const text = normalizeSearchText([item.title, item.description, item.content, pkg.name, pkg.description]
              .filter(Boolean).join(' '));
            if (q && (text.includes(q) || q.includes(normalizeSearchText(pkg.name)) || packageMatches)) {
              matched.push({ packageName: pkg.name, ...item });
            }
          }
        }

        if (matched.length === 0 && !isListContentPackageQuery(query)) {
          const recentPackage = await findPackageFromRecentConversation(conversation?.id, packages);
          if (recentPackage) {
            for (const item of recentPackage.items || []) {
              matched.push({ packageName: recentPackage.name, ...item });
            }
          }
        }

        if (matched.length === 0) {
          const list = packages.map((p) => `- ${p.name}: ${p.description || ''}`).join('\n');
          return { found: true, content: `Các gói hiện có:\n${list}\n\nBạn muốn xem gói nào?` };
        }

        const top = matched.slice(0, 3).map((item) => {
          let c = `📌 ${item.title} (${item.packageName})`;
          if (item.description) c += `\n${item.description}`;
          if (item.type === 'image_prompt' && item.content) c += `\nPrompt: ${item.content}`;
          else if (item.type === 'link' && item.url) c += `\nLink: ${item.url}`;
          else if (item.content) c += `\n${item.content}`;
          return c;
        }).join('\n\n');

        return { found: true, content: top };
      } catch (e) {
        return { found: false, content: 'Lỗi khi lấy gói nội dung: ' + e.message };
      }
    }

    default:
      return { error: `Tool không xác định: ${toolName}` };
  }
}

module.exports = { CLAUDE_TOOLS, OPENAI_TOOLS, executeTool };
