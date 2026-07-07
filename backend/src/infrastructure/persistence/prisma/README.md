# Prisma persistence

Folder này là điểm vào mới cho Prisma trong kiến trúc mục tiêu.

Hiện tại `client.js` chỉ re-export singleton từ `backend/src/db.js` để không tạo kết nối thứ hai và không đổi behavior. Các repository sau này sẽ import từ đây thay vì import trực tiếp `db.js`.
