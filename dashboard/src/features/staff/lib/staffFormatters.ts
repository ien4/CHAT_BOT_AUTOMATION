export function getStaffInitial(name: string) {
  return name.charAt(0).toUpperCase();
}

export function formatStaffJoinDate(createdAt: string) {
  return new Date(createdAt).toLocaleDateString('vi-VN');
}
