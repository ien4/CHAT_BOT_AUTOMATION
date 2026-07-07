// Lấy public URL từ ngrok API (chạy ở port 4040)
const http = require('http');

const req = http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const tunnels = JSON.parse(data).tunnels || [];
      const tunnel = tunnels.find(
        (t) => t.config && t.config.addr && t.config.addr.includes('3001')
      );
      if (tunnel) {
        process.stdout.write(tunnel.public_url);
      }
    } catch (e) {
      // không in gì — caller kiểm tra output rỗng
    }
  });
});
req.on('error', () => {});
req.setTimeout(3000, () => { req.destroy(); });
