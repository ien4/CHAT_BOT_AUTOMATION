// Script kiểm tra bot hoạt động
// Chạy: node test-bot.js

const http = require('http');

const API = 'http://localhost:3001';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(path, API);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Giả lập Facebook gửi tin nhắn (webhook POST)
function simulateFacebookMessage(senderId, messageText) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      object: 'page',
      entry: [{
        messaging: [{
          sender: { id: senderId },
          recipient: { id: 'page-id' },
          timestamp: Date.now(),
          message: { mid: 'mid-' + Date.now(), text: messageText, is_echo: false }
        }]
      }]
    });
    
    const url = new URL('/webhook', API);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
    }, (res) => {
      let out = '';
      res.on('data', chunk => out += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: out }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('🔍 BẮT ĐẦU KIỂM TRA BOT\n');
  
  // 1. Kiểm tra server
  try {
    console.log('1️⃣ Kiểm tra backend...');
    await get('/health', '');
    console.log('   ✅ Backend đang chạy\n');
  } catch (e) {
    console.log('   ❌ Backend chưa chạy!\n');
    process.exit(1);
  }

  // 2. Đăng nhập
  console.log('2️⃣ Đăng nhập admin...');
  try {
    const loginRes = await post('/api/auth/login', { username: 'admin', password: 'admin123' });
    const token = loginRes.token;
    console.log('   ✅ Đăng nhập thành công\n');
    
    // 3. Thêm kiến thức mẫu
    console.log('3️⃣ Thêm kiến thức mẫu...');
    const kbRes = await get('/api/knowledge', token);
    console.log(`   📚 Hiện có ${kbRes.data ? kbRes.data.length : 0} mục kiến thức\n`);

    // 4. Giả lập người dùng Facebook gửi tin nhắn
    const testUser = 'test_user_' + Date.now();
    const messages = [
      'Xin chào',
      'Công ty có dịch vụ gì?',
      'Cho mình xin địa chỉ công ty',
    ];

    for (const msg of messages) {
      console.log(`\n👤 Người dùng gửi: "${msg}"`);
      
      // Gửi tin nhắn giả lập (webhook)
      const result = await simulateFacebookMessage(testUser, msg);
      console.log(`   📡 Webhook response: ${result.status}`);
      
      // Đợi bot xử lý
      await new Promise(r => setTimeout(r, 1000));
      
      // Kiểm tra hội thoại đã được tạo trong database
      try {
        const convs = await get('/api/conversations', token);
        if (convs.data && convs.data.length > 0) {
          const conv = convs.data[0];
          const msgs = await get(`/api/conversations/${conv.id}/messages`, token);
          
          // Tìm tin nhắn cuối cùng của bot
          const botMsgs = msgs.filter(m => m.direction === 'outbound');
          if (botMsgs.length > 0) {
            const lastBotMsg = botMsgs[botMsgs.length - 1];
            console.log(`   🤖 Bot trả lời: "${lastBotMsg.content}"`);
            console.log(`   🎯 Intent: ${lastBotMsg.intent || 'N/A'}`);
          } else {
            console.log('   ⚠️  Bot chưa có phản hồi (có thể cần cấu hình API key LLM)');
          }
        }
      } catch (e) {
        console.log('   ℹ️  Không thể kiểm tra phản hồi (cần API key Gemini/DeepSeek)');
      }
    }

    // 5. Tổng kết
    console.log('\n\n📊 TỔNG KẾT KIỂM TRA');
    console.log('─'.repeat(50));
    
    try {
      const stats = await get('/api/stats', token);
      console.log(`   📱 Tổng hội thoại: ${stats.totalConversations}`);
      console.log(`   💬 Tổng tin nhắn:  ${stats.totalMessages}`);
      console.log(`   📚 Kiến thức:      ${stats.knowledgeCount}`);
    } catch (e) {
      console.log('   (Stats API error)');
    }
    
    console.log('\n✅ Bot đã sẵn sàng nhận tin nhắn!');
    console.log('📝 Vào Dashboard http://localhost:3002 để xem chi tiết');
    console.log('🔑 Đăng nhập: admin / admin123');
    console.log('\n⚠️  LƯU Ý: Để bot trả lời thông minh, cần cấu hình API key LLM (Gemini/DeepSeek)');
    console.log('   Vào Dashboard → Cài đặt → LLM Providers → Sửa → Nhập API Key');

  } catch (e) {
    console.error('Lỗi:', e.message);
  }
}

main();