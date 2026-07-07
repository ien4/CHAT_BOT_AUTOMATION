'use client';
import { useAuth } from '@/lib/auth';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  BookOpen,
  FileText,
  Megaphone,
  Settings,
  CalendarCheck,
  LogOut,
  Menu,
  X,
  Bot,
  Package,
  MessageCircle,
  BarChart3,
  Layers,
  Building2,
  ChevronDown,
} from 'lucide-react';
import { tenantsApi } from '@/lib/api';

const navItems = [
  { href: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/dashboard/conversations', label: 'Hội thoại', icon: MessageSquare },
  { href: '/dashboard/knowledge', label: 'Kiến thức', icon: BookOpen },
  { href: '/dashboard/prompts', label: 'Prompt', icon: FileText },
  { href: '/dashboard/campaigns', label: 'Chiến dịch', icon: Megaphone },
  { href: '/dashboard/content-packages', label: 'Gói nội dung', icon: Package },
  { href: '/dashboard/quick-replies', label: 'Quick Reply', icon: MessageCircle },
  { href: '/dashboard/channel-configs', label: 'Kênh chat', icon: Layers },
  { href: '/dashboard/tenants', label: 'Tenants', icon: Building2, platformAdminOnly: true },
  { href: '/dashboard/analytics', label: 'Thống kê', icon: BarChart3 },
  { href: '/dashboard/appointments', label: 'Lịch hẹn', icon: CalendarCheck },
  { href: '/dashboard/settings', label: 'Cài đặt', icon: Settings },
];

interface Tenant { id: string; name: string; slug: string; }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, isPlatformAdmin, selectedTenantId, setSelectedTenantId } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [scopeOpen, setScopeOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Load tenant list for platform admin switcher
  useEffect(() => {
    if (isPlatformAdmin) {
      tenantsApi.list().then(({ data }) => setTenants(data)).catch(() => {});
    }
  }, [isPlatformAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) return null;

  const visibleNavItems = navItems.filter(item =>
    !item.platformAdminOnly || isPlatformAdmin
  );

  const currentTenantName = selectedTenantId
    ? (tenants.find(t => t.id === selectedTenantId)?.name ?? selectedTenantId)
    : 'Global (dữ liệu dùng chung)';

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'block' : 'hidden'} lg:block`}>
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <Bot className="w-8 h-8 text-blue-400" />
            <div>
              <h1 className="text-lg font-bold">FB Chatbot</h1>
              <p className="text-xs text-gray-400">Dashboard</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-1 flex-1">
          {visibleNavItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`sidebar-link ${pathname === item.href ? 'active' : ''}`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </a>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">{user.username}</p>
              <p className="text-xs text-gray-400">{user.role}</p>
            </div>
            <button onClick={logout} className="text-gray-400 hover:text-red-400 transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 lg:ml-64 min-h-screen">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          {/* Tenant scope switcher — only for platform admin */}
          {isPlatformAdmin && (
            <div className="relative ml-auto">
              <button
                onClick={() => setScopeOpen(!scopeOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm text-gray-700"
              >
                <Building2 className="w-4 h-4 text-gray-500" />
                <span className="max-w-[180px] truncate">{currentTenantName}</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>

              {scopeOpen && (
                <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                  <div className="py-1">
                    <button
                      onClick={() => { setSelectedTenantId(null); setScopeOpen(false); }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${!selectedTenantId ? 'font-semibold text-blue-600' : 'text-gray-700'}`}
                    >
                      Global (dữ liệu dùng chung)
                    </button>
                    {tenants.length > 0 && <hr className="my-1 border-gray-100" />}
                    {tenants.map(t => (
                      <button
                        key={t.id}
                        onClick={() => { setSelectedTenantId(t.id); setScopeOpen(false); }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${selectedTenantId === t.id ? 'font-semibold text-blue-600' : 'text-gray-700'}`}
                      >
                        {t.name}
                        <span className="ml-1 text-xs text-gray-400">({t.slug})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tenant admin: show which tenant they're in */}
          {!isPlatformAdmin && user.tenantId && (
            <div className="ml-auto flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500">
              <Building2 className="w-4 h-4" />
              <span>{tenants.find(t => t.id === user.tenantId)?.name ?? user.tenantId}</span>
            </div>
          )}
        </div>

        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
