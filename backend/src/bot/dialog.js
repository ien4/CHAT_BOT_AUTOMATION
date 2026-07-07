const contextManager = require('./context');
const webhookHandler = require('../webhook/handler');
const getPrisma = require('../db');
const prisma = getPrisma();
const appointmentNotifications = require('../notifications/appointments');

/**
 * Dialog Manager - handles structured conversation flows
 * - Appointment booking flow
 * - Campaign inquiry flow
 */
class DialogManager {
  /**
   * Handle active dialog flow
   */
  async handleDialogFlow(conversation, messageText, dialogState) {
    switch (dialogState.type) {
      case 'appointment_name':
        return this.handleAppointmentName(conversation, messageText);
      case 'appointment_phone':
        return this.handleAppointmentPhone(conversation, messageText);
      case 'appointment_date':
        return this.handleAppointmentDate(conversation, messageText);
      case 'appointment_time':
        return this.handleAppointmentTime(conversation, messageText);
      case 'appointment_confirm':
        return this.handleAppointmentConfirm(conversation, messageText);
      case 'campaign_select':
        return this.handleCampaignSelect(conversation, messageText);
      case 'campaign_asset_select':
        return this.handleCampaignAssetSelect(conversation, messageText);
      default:
        // Exit dialog flow
        await contextManager.updateDialogState(conversation.id, null);
        return null; // Will be handled by normal flow
    }
  }

  /**
   * Start appointment booking flow
   */
  async startAppointmentFlow(conversation) {
    await contextManager.updateDialogState(conversation.id, {
      type: 'appointment_name',
      data: {},
    });

    return {
      text: '📅 Rất vui được sắp xếp lịch tư vấn cho bạn!\n\nTrước tiên, bạn cho mình xin tên của bạn được không ạ?',
    };
  }

  /**
   * Collect name
   */
  async handleAppointmentName(conversation, messageText) {
    const name = messageText.trim();

    await contextManager.updateDialogState(conversation.id, {
      type: 'appointment_phone',
      data: { name },
    });

    // Update user name in conversation
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { fbUserName: name },
    });

    return {
      text: `Cảm ơn ${name}! Bạn cho mình xin số điện thoại để chuyên viên của chúng mình liên hệ nhé 📞`,
    };
  }

  /**
   * Collect phone number
   */
  async handleAppointmentPhone(conversation, messageText) {
    const phone = messageText.trim();

    await contextManager.updateDialogState(conversation.id, {
      type: 'appointment_date',
      data: {
        ...conversation.context?.dialogState?.data,
        phone,
      },
    });

    // Suggest next 7 days
    const dates = [];
    const today = new Date();
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dayOfWeek = d.toLocaleDateString('vi-VN', { weekday: 'short' });
      const dateStr = d.toISOString().split('T')[0];
      dates.push({ label: `${dayOfWeek} - ${dateStr}`, value: dateStr });
    }

    const quickReplies = dates.map((d) => ({
      content_type: 'text',
      title: d.label,
      payload: `DATE_${d.value}`,
    }));

    return {
      text: 'Bạn muốn sắp xếp lịch vào ngày nào ạ? Dưới đây là các ngày gợi ý:',
      quick_replies: quickReplies.slice(0, 7),
    };
  }

  /**
   * Handle date selection via postback
   */
  async handleDateSelection(conversation, date) {
    const currentState = conversation.context?.dialogState || { data: {} };

    await contextManager.updateDialogState(conversation.id, {
      type: 'appointment_time',
      data: {
        ...currentState.data,
        date,
      },
    });

    const timeSlots = [
      { label: '08:00 - 09:00', value: '08:00' },
      { label: '09:00 - 10:00', value: '09:00' },
      { label: '10:00 - 11:00', value: '10:00' },
      { label: '14:00 - 15:00', value: '14:00' },
      { label: '15:00 - 16:00', value: '15:00' },
      { label: '16:00 - 17:00', value: '16:00' },
    ];

    const quickReplies = timeSlots.map((t) => ({
      content_type: 'text',
      title: t.label,
      payload: `TIME_${t.value}`,
    }));

    return {
      text: `Bạn chọn ngày ${date}. Khung giờ nào phù hợp với bạn ạ?`,
      quick_replies,
    };
  }

  /**
   * Handle time selection via postback
   */
  async handleTimeSelection(conversation, time) {
    const currentState = conversation.context?.dialogState || { data: {} };

    await contextManager.updateDialogState(conversation.id, {
      type: 'appointment_confirm',
      data: {
        ...currentState.data,
        time,
      },
    });

    const data = currentState.data || {};

    return {
      text: `📋 Xác nhận thông tin đặt lịch:\n\n` +
        `👤 Tên: ${data.name || '...'}\n` +
        `📞 SĐT: ${data.phone || '...'}\n` +
        `📅 Ngày: ${data.date || '...'}\n` +
        `⏰ Giờ: ${time}\n\n` +
        `Thông tin trên đã chính xác chưa ạ?`,
      quick_replies: [
        { content_type: 'text', title: '✅ Xác nhận', payload: 'CONFIRM_APPOINTMENT' },
        { content_type: 'text', title: '❌ Hủy', payload: 'CANCEL_APPOINTMENT' },
      ],
    };
  }

  /**
   * Handle appointment date text input (fallback)
   */
  async handleAppointmentDate(conversation, messageText) {
    // Simple date parsing attempt
    const date = messageText.trim();
    const currentState = conversation.context?.dialogState || { data: {} };

    await contextManager.updateDialogState(conversation.id, {
      type: 'appointment_time',
      data: { ...currentState.data, date },
    });

    return {
      text: `Bạn chọn ngày ${date}. Bạn muốn gặp vào khung giờ nào ạ? (Ví dụ: 9h sáng, 2h chiều...)`,
    };
  }

  /**
   * Handle appointment time text input (fallback)
   */
  async handleAppointmentTime(conversation, messageText) {
    const time = messageText.trim();
    const currentState = conversation.context?.dialogState || { data: {} };

    await contextManager.updateDialogState(conversation.id, {
      type: 'appointment_confirm',
      data: { ...currentState.data, time },
    });

    const data = currentState.data || {};
    return {
      text: `📋 Xác nhận thông tin đặt lịch:\n\n` +
        `👤 Tên: ${data.name}\n` +
        `📞 SĐT: ${data.phone}\n` +
        `📅 Ngày: ${data.date}\n` +
        `⏰ Giờ: ${time}\n\n` +
        `Thông tin trên đã chính xác chưa ạ?`,
      quick_replies: [
        { content_type: 'text', title: '✅ Xác nhận', payload: 'CONFIRM_APPOINTMENT' },
        { content_type: 'text', title: '❌ Hủy', payload: 'CANCEL_APPOINTMENT' },
      ],
    };
  }

  /**
   * Handle appointment confirmation yes/no
   */
  async handleAppointmentConfirm(conversation, messageText) {
    const lower = messageText.toLowerCase();

    const isConfirm =
      lower.includes('xác nhận') || lower.includes('đúng') || lower.includes('ok') ||
      lower.includes('yes') || lower.includes('được') || lower.includes('ừ') ||
      lower.includes('đồng ý') || lower.includes('chính xác');

    const isCancel =
      lower.includes('hủy') || lower.includes('không') || lower.includes('cancel') ||
      lower.includes('thôi') || lower.includes('bỏ');

    if (isConfirm) {
      return this.confirmAppointment(conversation);
    } else if (isCancel) {
      await contextManager.updateDialogState(conversation.id, null);
      return {
        text: 'Đã hủy đặt lịch. Bạn có thể đặt lại bất cứ lúc nào nhé! Nếu cần hỗ trợ gì thêm, cứ nhắn cho mình.',
      };
    } else {
      // Ambiguous message — repeat confirmation prompt instead of silently cancelling
      const data = conversation.context?.dialogState?.data || {};
      return {
        text: `📋 Xác nhận thông tin đặt lịch:\n\n` +
          `👤 Tên: ${data.name || '...'}\n` +
          `📞 SĐT: ${data.phone || '...'}\n` +
          `📅 Ngày: ${data.date || '...'}\n` +
          `⏰ Giờ: ${data.time || '...'}\n\n` +
          `Bạn xác nhận thông tin trên đúng không ạ?`,
        quick_replies: [
          { content_type: 'text', title: '✅ Xác nhận', payload: 'CONFIRM_APPOINTMENT' },
          { content_type: 'text', title: '❌ Hủy', payload: 'CANCEL_APPOINTMENT' },
        ],
      };
    }
  }

  /**
   * Confirm and save appointment
   */
  async confirmAppointment(conversation) {
    // Re-fetch to get latest dialog state (in case stale object was passed)
    const fresh = await prisma.conversation.findUnique({
      where: { id: conversation.id },
      select: { context: true, fbUserId: true, fbUserName: true },
    });
    const state = fresh?.context?.dialogState || conversation.context?.dialogState;
    const data = state?.data || {};

    try {
      // Dedup: don't create if a pending/confirmed appointment already exists for same user+date
      if (data.date) {
        const duplicate = await prisma.appointment.findFirst({
          where: {
            fbUserId: conversation.fbUserId,
            date: data.date,
            status: { in: ['pending', 'confirmed'] },
          },
        });
        if (duplicate) {
          await contextManager.updateDialogState(conversation.id, null);
          const statusLabel = duplicate.status === 'confirmed' ? '✅ Đã xác nhận' : '⏳ Chờ xác nhận';
          return {
            text: `📅 Lịch hẹn ngày ${data.date} của bạn đã tồn tại!\n\nTrạng thái: ${statusLabel}\nNhân viên sẽ liên hệ xác nhận với bạn nhé!`,
          };
        }
      }

      const appointment = await prisma.appointment.create({
        data: {
          conversationId: conversation.id,
          fbUserId: conversation.fbUserId,
          fbUserName: data.name || conversation.fbUserName,
          date: data.date,
          time: data.time,
          phone: data.phone,
          status: 'pending',
          notes: 'Đặt qua chatbot',
        },
      });

      await appointmentNotifications.booked(appointment);

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: 'appointment_booked' },
      });

      await contextManager.updateDialogState(conversation.id, null);

      return {
        text: `✅ Đặt lịch thành công!\n\n` +
          `Chuyên viên của chúng mình sẽ liên hệ với bạn vào ngày ${data.date} lúc ${data.time} qua số ${data.phone}.\n\n` +
          `Cảm ơn bạn đã quan tâm! Nếu cần hỗ trợ gì thêm, cứ nhắn cho mình nhé 😊`,
      };
    } catch (error) {
      console.error('Error saving appointment:', error);
      await contextManager.updateDialogState(conversation.id, null);
      return {
        text: 'Có lỗi xảy ra khi đặt lịch. Bạn vui lòng thử lại sau hoặc liên hệ trực tiếp qua hotline nhé!',
      };
    }
  }

  /**
   * Cancel appointment flow
   */
  async cancelAppointmentFlow(conversation) {
    await contextManager.updateDialogState(conversation.id, null);
    return {
      text: 'Đã hủy đặt lịch. Bạn có thể đặt lại bất cứ lúc nào nhé! Nếu cần hỗ trợ gì thêm, cứ nhắn cho mình.',
    };
  }

    /**
   * Handle content package selection flow
   * (đã chuyển từ Campaign cũ → ContentPackage)
   */
  async handleCampaignSelect(conversation, messageText) {
    const packages = await prisma.contentPackage.findMany({
      where: { isActive: true, isPublic: true },
      select: { id: true, name: true, description: true },
    });

    const matched = packages.find(
      (p) =>
        p.name.toLowerCase().includes(messageText.toLowerCase()) ||
        messageText.toLowerCase().includes(p.name.toLowerCase())
    );

    if (matched) {
      await contextManager.updateDialogState(conversation.id, {
        type: 'campaign_asset_select',
        data: { campaignId: matched.id, campaignName: matched.name },
      });

      return {
        text: `📦 Gói nội dung "${matched.name}":\n${matched.description || 'Chưa có mô tả chi tiết'}\n\nBạn cần prompt của hình ảnh nào? Hay cần tài liệu gì ạ?`,
      };
    }

    // Not found - exit flow
    await contextManager.updateDialogState(conversation.id, null);
    return {
      text: `Mình không tìm thấy gói nội dung "${messageText}". Bạn kiểm tra lại tên gói nhé!`,
    };
  }

  /**
   * Handle content package item selection
   */
  async handleCampaignAssetSelect(conversation, messageText) {
    const state = conversation.context?.dialogState;
    const packageId = state?.data?.campaignId;

    if (!packageId) {
      await contextManager.updateDialogState(conversation.id, null);
      return null;
    }

    const pkg = await prisma.contentPackage.findUnique({
      where: { id: packageId },
      include: { items: { orderBy: { order: 'asc' } } },
    });

    if (!pkg) {
      await contextManager.updateDialogState(conversation.id, null);
      return null;
    }

    const items = pkg.items || [];
    // Tìm item có title khớp
    const matchedItem = items.find(
      (item) => item.title.toLowerCase().includes(messageText.toLowerCase()) ||
        messageText.toLowerCase().includes(item.title.toLowerCase())
    );

    if (matchedItem) {
      let response = `📎 Đây là thông tin bạn yêu cầu từ gói "${pkg.name}":\n\n`;

      if (matchedItem.type === 'image_prompt') {
        response += `🎨 Prompt:\n\`\`\`\n${matchedItem.content}\n\`\`\`\n`;
      } else if (matchedItem.url) {
        response += `🔗 Link: ${matchedItem.url}\n`;
      }
      if (matchedItem.content && matchedItem.type !== 'image_prompt') {
        response += `📝 ${matchedItem.content}\n`;
      }
      if (matchedItem.description) {
        response += `📋 ${matchedItem.description}\n`;
      }

      await contextManager.updateDialogState(conversation.id, null);
      return { text: response + '\nBạn cần hỗ trợ gì thêm không ạ?' };
    }

    // List available items
    const itemList = items
      .map((item, i) => {
        const icons = { image_prompt: '🎨', skill: '💡', link: '🔗', document: '📄' };
        return `${i + 1}. ${icons[item.type] || '📄'} ${item.title}`;
      })
      .join('\n');

    await contextManager.updateDialogState(conversation.id, null);

    if (itemList) {
      return {
        text: `Gói "${pkg.name}" có các mục sau:\n\n${itemList}\n\nBạn muốn xem mục nào? Hãy nói tên nhé!`,
      };
    }

    return {
      text: `Gói "${pkg.name}" hiện chưa có nội dung chi tiết. Bạn vui lòng liên hệ trực tiếp nhé!`,
    };
  }
}

module.exports = new DialogManager();
