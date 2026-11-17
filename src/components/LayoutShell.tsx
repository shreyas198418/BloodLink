import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  Droplets,
  GitCompareArrows,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { NotificationItem } from '../types/bloodlink.ts';

export type NavSection =
  | 'dashboard'
  | 'inventory'
  | 'donors'
  | 'requests'
  | 'matching'
  | 'blood-banks'
  | 'analytics'
  | 'settings';

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'inventory', label: 'Blood Inventory', icon: Droplets },
  { id: 'donors', label: 'Donors', icon: Users },
  { id: 'requests', label: 'Blood Requests', icon: ClipboardList },
  { id: 'matching', label: 'Smart Matching', icon: GitCompareArrows },
  { id: 'blood-banks', label: 'Blood Banks', icon: Building2 },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function BloodDropLogo() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="28" height="28" rx="7" fill="#E53945" />
      <path
        d="M14 6.5C14 6.5 8.5 13.1 8.5 16.9C8.5 19.9376 10.9624 22.4 14 22.4C17.0376 22.4 19.5 19.9376 19.5 16.9C19.5 13.1 14 6.5 14 6.5Z"
        fill="#FFFFFF"
      />
      <path
        d="M12.2 17.2C12.2 18.4 12.9 19.3 13.9 19.6"
        stroke="#E53945"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface LayoutShellProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  children: React.ReactNode;
}

export function LayoutShell({
  activeSection,
  onNavigate,
  children,
}: LayoutShellProps) {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  async function loadNotifications() {
    setNotifLoading(true);
    try {
      const res = await apiFetch<{ notifications: NotificationItem[] }>('/api/notifications');
      setNotifications(res.notifications);
    } catch {
      // Handled gracefully
    } finally {
      setNotifLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
  }, [activeSection]);

  async function handleMarkRead(id: string) {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
    } catch {
      // Ignore error
    }
  }

  async function handleMarkAllRead() {
    try {
      await apiFetch('/api/notifications/mark-all-read', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // Ignore error
    }
  }

  const activeTitle =
    NAV_ITEMS.find((item) => item.id === activeSection)?.label || 'Dashboard';

  return (
    <div className="min-h-screen bg-[#F4F6FA] text-[#202A44]">
      {/* Fixed Navy Top Header */}
      <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-[#101B3F] text-white border-b border-[#17264F] px-4 lg:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="lg:hidden inline-flex items-center justify-center h-10 w-10 rounded-lg text-slate-200 hover:bg-[#17264F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E53945]"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E53945] rounded-md"
          >
            <BloodDropLogo />
            <span className="font-display text-lg font-bold tracking-tight text-white">
              BloodLink
            </span>
          </button>

          <span className="hidden sm:inline-block text-slate-500">/</span>
          <span className="hidden sm:inline-block text-sm font-medium text-slate-300 truncate">
            {activeTitle}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Notification Bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                const next = !notifOpen;
                setNotifOpen(next);
                if (next) loadNotifications();
              }}
              aria-label={`Notifications (${unreadCount} unread)`}
              className="relative inline-flex items-center justify-center h-10 w-10 rounded-lg bg-[#17264F] text-slate-200 hover:bg-[#1e3164] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E53945]"
            >
              <Bell className="h-4.5 w-4.5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E53945] text-[10px] font-bold text-white flex items-center justify-center tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div
                role="dialog"
                aria-label="System notifications"
                className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white text-[#202A44] shadow-xl border border-[#E8EBF2] overflow-hidden z-50"
              >
                <div className="px-4 py-3 border-b border-[#E8EBF2] flex items-center justify-between">
                  <span className="font-display text-sm font-semibold">
                    Stock & Request Alerts
                  </span>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-xs font-medium text-[#E53945] hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-[#E8EBF2]">
                  {notifLoading && notifications.length === 0 ? (
                    <p className="p-4 text-xs text-[#7B8499]">Loading alerts...</p>
                  ) : notifications.length === 0 ? (
                    <p className="p-4 text-xs text-[#7B8499]">No system alerts recorded.</p>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`p-3.5 text-left transition-colors ${
                          n.isRead ? 'bg-white' : 'bg-[#FDEBEC]/45'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-[#202A44]">{n.title}</p>
                          {!n.isRead && (
                            <button
                              type="button"
                              onClick={() => handleMarkRead(n.id)}
                              className="text-[11px] font-medium text-[#E53945] hover:underline shrink-0"
                            >
                              Dismiss
                            </button>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-[#7B8499] leading-relaxed">
                          {n.message}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile & Role */}
          <div className="hidden md:flex items-center gap-2.5 pl-2 border-l border-[#17264F]">
            <div className="h-8 w-8 rounded-lg bg-[#E53945] text-white font-display text-xs font-bold flex items-center justify-center shrink-0">
              {(user?.fullName || 'BL')
                .replace(/^(Dr\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, '')
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join('') || 'BL'}
            </div>
            <div className="leading-tight text-left">
              <div className="text-xs font-semibold text-white truncate max-w-[140px]">
                {user?.fullName}
              </div>
              <div className="text-[11px] text-slate-300 truncate max-w-[180px]">
                {user?.role === 'ADMIN'
                  ? 'Administrator'
                  : `Staff · ${user?.bloodBankName || 'Assigned Bank'}`}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            aria-label="Log out"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#17264F] hover:bg-[#E53945] text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-[#101B3F]/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left Navy Sidebar */}
      <aside
        aria-label="Primary Navigation"
        className={`fixed top-16 bottom-0 left-0 z-30 w-[248px] bg-[#111D42] text-white border-r border-[#17264F] flex flex-col justify-between transition-transform duration-200 lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <nav className="p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onNavigate(item.id);
                  setMobileMenuOpen(false);
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#E53945] text-white shadow-sm'
                    : 'text-slate-300 hover:bg-[#17264F] hover:text-white'
                }`}
              >
                <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#17264F] text-xs text-slate-300 space-y-1">
          <p className="font-semibold text-white truncate">{user?.email}</p>
          <p className="text-[11px] text-slate-400">
            Role: {user?.role} {user?.bloodBankName ? `· ${user.bloodBankName}` : '· Network Wide'}
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="pt-16 lg:pl-[248px] min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1440px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
