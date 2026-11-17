import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  Droplets,
  Plus,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch } from '../lib/api.ts';
import { DashboardData } from '../types/bloodlink.ts';
import { NavSection } from './LayoutShell.tsx';
import {
  BloodGroupTag,
  PriorityBadge,
  RequestStatusLabel,
  StockStatusLabel,
} from './StatusBadges.tsx';

interface DashboardViewProps {
  onNavigate: (section: NavSection, options?: { openCreate?: boolean; requestId?: string }) => void;
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchDashboard() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<DashboardData>('/api/dashboard');
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-white border border-[#E8EBF2] animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-80 rounded-xl bg-white border border-[#E8EBF2] animate-pulse" />
          <div className="h-80 rounded-xl bg-white border border-[#E8EBF2] animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl bg-white border border-[#E8EBF2] p-6 text-center">
        <p className="text-sm font-medium text-[#E53945]">{error || 'Unable to load dashboard.'}</p>
        <button
          type="button"
          onClick={fetchDashboard}
          className="mt-3 px-4 py-2 rounded-lg bg-[#101B3F] text-white text-xs font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  const statCards = [
    {
      label: 'Total Blood Banks',
      value: data.stats.totalBloodBanks,
      sub: `${data.stats.activeBloodBanks} active facilities`,
      icon: Building2,
      iconBg: 'bg-[#EEF1F7] text-[#101B3F]',
    },
    {
      label: 'Registered Donors',
      value: data.stats.registeredDonors,
      sub: `${data.stats.availableDonors} currently available`,
      icon: Users,
      iconBg: 'bg-[#EAF7F1] text-[#27AE75]',
    },
    {
      label: 'Pending Requests',
      value: data.stats.pendingRequests,
      sub: `${data.stats.emergencyPending} emergency priority`,
      icon: ClipboardList,
      iconBg: 'bg-[#FDEBEC] text-[#E53945]',
    },
    {
      label: 'Available Blood Units',
      value: data.stats.availableBloodUnits,
      sub: `${data.stats.lowStockCount} low-stock alerts`,
      icon: Droplets,
      iconBg: 'bg-[#FEF5E7] text-[#F39C38]',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Title & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#202A44]">
            Operations Dashboard
          </h1>
          <p className="text-sm text-[#7B8499]">
            Live multi-bank inventory, active hospital requests, and donor readiness across the network.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('inventory', { openCreate: true })}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-[#E8EBF2] hover:border-[#101B3F] text-xs font-semibold text-[#202A44] transition-colors whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5 text-[#E53945]" aria-hidden="true" />
            Add Blood Inventory
          </button>
          <button
            type="button"
            onClick={() => onNavigate('donors', { openCreate: true })}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-[#E8EBF2] hover:border-[#101B3F] text-xs font-semibold text-[#202A44] transition-colors whitespace-nowrap"
          >
            <UserPlus className="h-3.5 w-3.5 text-[#27AE75]" aria-hidden="true" />
            Register Donor
          </button>
          <button
            type="button"
            onClick={() => onNavigate('requests', { openCreate: true })}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#E53945] hover:bg-[#cf2d38] text-xs font-semibold text-white transition-colors whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Create Blood Request
          </button>
        </div>
      </div>

      {/* Top 4 KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl bg-white border border-[#E8EBF2] p-5 flex items-start justify-between gap-4"
            >
              <div>
                <p className="text-xs font-semibold text-[#7B8499]">{card.label}</p>
                <p className="mt-2 font-display text-3xl font-bold text-[#202A44] tabular-nums">
                  {card.value}
                </p>
                <p className="mt-1.5 text-xs text-[#7B8499]">{card.sub}</p>
              </div>
              <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${card.iconBg}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl bg-white border border-[#E8EBF2] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-bold text-[#202A44]">
                Blood Inventory Overview
              </h2>
              <p className="text-xs text-[#7B8499]">
                Valid, non-expired units available across all blood banks by blood group
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="text-xs font-semibold text-[#E53945] hover:underline whitespace-nowrap"
            >
              Manage Stock
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.inventoryByGroup} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8EBF2" vertical={false} />
                <XAxis dataKey="bloodGroup" tick={{ fill: '#202A44', fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#7B8499', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid #E8EBF2',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="units" name="Available Units" fill="#101B3F" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                  {data.inventoryByGroup.map((entry) => (
                    <Cell
                      key={entry.bloodGroup}
                      fill={entry.units <= 10 ? '#E53945' : '#101B3F'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl bg-white border border-[#E8EBF2] p-5 flex flex-col justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-[#202A44]">
              Request Urgency Distribution
            </h2>
            <p className="text-xs text-[#7B8499]">
              Active & historical requests segmented by clinical tier
            </p>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.urgencyDistribution}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={3}
                  isAnimationActive={false}
                >
                  {data.urgencyDistribution.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid #E8EBF2',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#E8EBF2]">
            {data.urgencyDistribution.map((item) => (
              <div key={item.name} className="text-center">
                <p className="text-[11px] font-medium text-[#7B8499]">{item.name}</p>
                <p className="font-display text-lg font-bold tabular-nums" style={{ color: item.color }}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Blood Requests & Low Stock Alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 rounded-xl bg-white border border-[#E8EBF2] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E8EBF2] flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-[#202A44]">
                Recent Blood Requests
              </h2>
              <p className="text-xs text-[#7B8499]">
                Ordered by priority score and recency
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('requests')}
              className="text-xs font-semibold text-[#E53945] hover:underline whitespace-nowrap"
            >
              View All Requests
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E8EBF2] bg-[#F4F6FA]/60 text-[11px] font-semibold text-[#7B8499]">
                  <th className="py-3 px-3">ID</th>
                  <th className="py-3 px-3">Hospital</th>
                  <th className="py-3 px-3">Group</th>
                  <th className="py-3 px-2 text-right">Units</th>
                  <th className="py-3 px-3">Priority</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EBF2] text-sm">
                {data.recentRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-[#F4F6FA]/50 transition-colors">
                    <td className="py-3 px-3 font-mono-tabular text-xs font-semibold text-[#101B3F] whitespace-nowrap">
                      {req.requestCode}
                    </td>
                    <td className="py-3 px-3 max-w-[180px]">
                      <div className="font-medium text-[#202A44] truncate">{req.hospitalName}</div>
                      <div className="text-[11px] text-[#7B8499] tabular-nums">
                        {new Date(req.requestDate).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <BloodGroupTag group={req.requiredBloodGroup} />
                    </td>
                    <td className="py-3 px-2 text-right font-mono-tabular text-xs font-semibold">
                      {req.unitsFulfilled}/{req.unitsRequired}
                    </td>
                    <td className="py-3 px-3">
                      <PriorityBadge priority={req.priority} />
                    </td>
                    <td className="py-3 px-3">
                      <RequestStatusLabel status={req.status} />
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => onNavigate('matching', { requestId: req.id })}
                        className="text-xs font-semibold text-[#E53945] hover:underline whitespace-nowrap"
                      >
                        Match
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl bg-white border border-[#E8EBF2] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E8EBF2] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#F39C38]" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-[#202A44]">
                Low Stock Alerts
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="text-xs font-semibold text-[#E53945] hover:underline whitespace-nowrap"
            >
              Restock
            </button>
          </div>
          <div className="divide-y divide-[#E8EBF2]">
            {data.lowStockAlerts.length === 0 ? (
              <p className="p-6 text-sm text-[#7B8499] text-center">
                All active blood batches meet minimum stock thresholds.
              </p>
            ) : (
              data.lowStockAlerts.map((alert) => (
                <div key={alert.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <BloodGroupTag group={alert.bloodGroup} />
                      <span className="text-xs font-semibold text-[#202A44] truncate">
                        {alert.bankName}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#7B8499] tabular-nums">
                      Available: <strong className="text-[#202A44]">{alert.unitsAvailable}</strong> · Min threshold: {alert.minimumThreshold}
                    </p>
                  </div>
                  <StockStatusLabel status={alert.alertStatus} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
