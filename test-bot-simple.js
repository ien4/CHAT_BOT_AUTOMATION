// Script kiểm tra bot - ĐƠN GIẢN VÀ CHÍNH XÁC
// Chạy: node test-bot-simple.js

const http = require('http');

const API = 'http://localhost:3001';

function request(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API);
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload ? payload.length : 0,
      }
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', (e) => reject(e));
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('🔍 KIỂM TRA BOT FACEBOOK CHATBOT\n');
  console.log('═'.repeat(60));

  // 1. Health check
  console.log('\n📡 1. Health Check');
  try {
    await request('GET', '/health', '', null);
    console.log('   ✅ Backend đang chạy trên port 3001');
  } catch (e) {
    console.log('   ❌ Backend KHÔNG chạy! Gõ: cd backend && node src/index.js');
    process.exit(1);
  }

  // 2. Login admin
  console.log('\n🔑 2. Đăng nhập Admin');
  let token;
  try {
    const login = await request('POST', '/api/auth/login', '', { username: 'admin', password: 'admin123' });
    token = login.token;
    console.log('   ✅ Đăng nhập OK');
  } catch (e) {
    console.log('   ❌ Đăng nhập thất bại:', e.message);
    process.exit(1);
  }

  // 3. Add sample knowledge
  console.log('\n📚 3. Thêm kiến thức mẫu');
  const knowledges = [
    { title: 'Giới thiệu công ty ABC', content: 'Công ty ABC thành lập năm 2015, chuyên Digital Marketing. Địa chỉ: 123 Nguyễn Huệ, Q1, TP.HCM. Hotline: 1900 1234. Email: contact@abc.vn.', category: 'company_info' },
    { title: 'Dịch vụ Facebook Ads', content: 'Quảng cáo Facebook chuyên nghiệp: thiết kế nội dung, tối ưu CPA, remarketing. Gói từ 5-20 triệu/tháng. Tặng kèm báo cáo hàng tuần.', category: 'service' },
    { title: 'Dịch vụ thiết kế website', content: 'Website chuẩn SEO, responsive, tối ưu tốc độ. Giá từ 15 triệu. Bảo hành 12 tháng, hosting miễn phí năm đầu.', category: 'service' },
  ];

  for (const kb of knowledges) {
    try {
      await request('POST', '/api/knowledge', token, kb);
      console.log(`   ✅ Đã thêm: ${kb.title}`);
    } catch (e) {
      console.log(`   ⚠️  Lỗi thêm "${kb.title}": ${e.message}`);
    }
  }

  // 4. Giả lập tin nhắn Facebook
  console.log('\n💬 4. Giả lập người dùng gửi tin nhắn');
  
  const testSender = 'fb_test_user_' + Date.now();
  const testMessages = [
    'xin chào shop',
    'công ty mình có những dịch vụ gì',
    'địa chỉ công ty ở đâu',
  ];

  for (const msg of testMessages) {
    console.log(`\n   👤 User: "${msg}"`);

    // Gửi webhook event (đúng format Facebook)
    const webhookBody = {
      object: 'page',
      entry: [{
        messaging: [{
          sender: { id: testSender },
          recipient: { id: 'page_id_123' },
          timestamp: Date.now(),
          message: { mid: 'mid_' + Date.now(), text: msg, is_echo: false }
        }]
      }]
    };

    try {
      await request('POST', '/webhook', '', webhookBody);
      console.log('   📡 Webhook nhận thành công (200 OK)');
      
      // Đợi bot xử lý
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.log(`   ❌ Lỗi webhook: ${e.message}`);
    }
  }

  // 5. Kiểm tra kết quả
  console.log('\n📊 5. KẾT QUẢ');
  console.log('─'.repeat(60));
  
  try {
    const convs = await request('GET', '/api/conversations', token);
    console.log(`   📱 Hội thoại: ${convs.data ? convs.data.length : 0}`);
    
    if (convs.data && convs.data.length > 0) {
      const conv = convs.data[0];
      const msgs = await request('GET', `/api/conversations/${conv.id}/messages`, token);
      console.log(`   💬 Tin nhắn: ${Array.isArray(msgs) ? msgs.length : 0}`);
      
      if (Array.isArray(msgs)) {
        msgs.forEach(m => {
          const icon = m.direction === 'inbound' ? '👤' : '🤖';
          const intent = m.intent ? ` [${m.intent}]` : '';
          console.log(`   ${icon} ${m.content.substring(0, 80)}${intent}`);
        });
      }
    }

    const stats = await request('GET', '/api/stats', token);
    console.log(`   📚 Kiến thức: ${stats.knowledgeCount}`);
  } catch (e) {
    console.log('   ⚠️  Lỗi kiểm tra kết quả:', e.message);
  }

  // 6. Tổng kết
  console.log('\n' + '═'.repeat(60));
  console.log('✅ BOT ĐANG HOẠT ĐỘNG!');
  console.log('\n🖥️  Xem chi tiết: http://localhost:3002');
  console.log('🔑 Tài khoản: admin / admin123');
  console.log('\n📋 CÁC BƯỚC TIẾP THEO:');
  console.log('   1. Vào Dashboard -> Cài đặt cập nhật API key LLM');
  console.log('   2. Vào Dashboard -> Kiến thức thêm dữ liệu công ty');
  console.log('   3. Cấu hình Facebook Webhook với URL ngrok');
  console.log('   4. Test với người dùng thật trên Facebook Messenger');
}

main();