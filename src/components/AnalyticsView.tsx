import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch } from '../lib/api.ts';
import { BloodGroupTag } from './StatusBadges.tsx';

interface AnalyticsPayload {
  unitsByGroup: Array<{ bloodGroup: string; availableUnits: number; requestedUnits: number }>;
  inventoryByBank: Array<{ bankName: string; fullName: string; availableUnits: number; lowStockBatches: number }>;
  requestSummary: {
    emergency: number;
    urgent: number;
    routine: number;
    fulfilled: number;
    pending: number;
    matched: number;
  };
  donorStats: Array<{ bloodGroup: string; total: number; available: number }>;
  requestTrends: Array<{ period: string; Emergency: number; Urgent: number; Routine: number; units: number }>;
  lowStockReport: Array<{
    id: string;
    bankName: string;
    bloodGroup: string;
    unitsAvailable: number;
    minimumThreshold: number;
    deficit: number;
  }>;
}

export function AnalyticsView() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch<AnalyticsPayload>('/api/analytics');
        setData(res);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading && !data) {
    return <div className="p-8 text-center text-sm text-[#7B8499]">Generating live SQL analytics...</div>;
  }

  if (error || !data) {
    return (
      <div role="alert" className="rounded-xl bg-white border border-[#E8EBF2] p-6 text-sm text-[#E53945]">
        {error || 'Unable to load analytics.'}
      </div>
    );
  }

  const summaryItems = [
    { label: 'Emergency Requests', value: data.requestSummary.emergency, color: '#E53945' },
    { label: 'Urgent Requests', value: data.requestSummary.urgent, color: '#F39C38' },
    { label: 'Routine Requests', value: data.requestSummary.routine, color: '#27AE75' },
    { label: 'Fulfilled', value: data.requestSummary.fulfilled, color: '#27AE75' },
    { label: 'Active Pending', value: data.requestSummary.pending, color: '#101B3F' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#202A44]">
          Network Analytics & Reports
        </h1>
        <p className="text-sm text-[#7B8499]">
          Live supply-versus-demand aggregations, regional blood bank distribution, and donor readiness metrics.
        </p>
      </div>

      {/* Request Breakdown KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {summaryItems.map((item) => (
          <div key={item.label} className="rounded-xl bg-white border border-[#E8EBF2] p-4">
            <p className="text-xs font-semibold text-[#7B8499]">{item.label}</p>
            <p className="mt-1.5 font-display text-2xl font-bold tabular-nums" style={{ color: item.color }}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl bg-white border border-[#E8EBF2] p-5">
          <h2 className="font-display text-base font-bold text-[#202A44]">
            Available Supply vs. Hospital Demand by Blood Group
          </h2>
          <p className="text-xs text-[#7B8499] mb-4">
            Valid non-expired units compared against active & historical requested units
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.unitsByGroup} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8EBF2" vertical={false} />
                <XAxis dataKey="bloodGroup" tick={{ fill: '#202A44', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#7B8499', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #E8EBF2', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="availableUnits" name="Available Units" fill="#101B3F" radius={[4, 4, 0, 0]} />
                <Bar dataKey="requestedUnits" name="Requested Units" fill="#E53945" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl bg-white border border-[#E8EBF2] p-5">
          <h2 className="font-display text-base font-bold text-[#202A44]">
            Inventory Capacity by Blood Bank
          </h2>
          <p className="text-xs text-[#7B8499] mb-4">
            Total valid units across regional blood centers
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.inventoryByBank} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8EBF2" vertical={false} />
                <XAxis dataKey="bankName" tick={{ fill: '#202A44', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#7B8499', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #E8EBF2', fontSize: '12px' }} />
                <Bar dataKey="availableUnits" name="Valid Units" fill="#27AE75" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl bg-white border border-[#E8EBF2] p-5">
          <h2 className="font-display text-base font-bold text-[#202A44]">
            Request Volume & Urgency Trends
          </h2>
          <p className="text-xs text-[#7B8499] mb-4">
            Hospital request intake grouped by date and urgency tier
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.requestTrends} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8EBF2" vertical={false} />
                <XAxis dataKey="period" tick={{ fill: '#202A44', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#7B8499', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #E8EBF2', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area type="monotone" dataKey="Emergency" stackId="1" stroke="#E53945" fill="#FDEBEC" />
                <Area type="monotone" dataKey="Urgent" stackId="1" stroke="#F39C38" fill="#FEF5E7" />
                <Area type="monotone" dataKey="Routine" stackId="1" stroke="#27AE75" fill="#EAF7F1" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl bg-white border border-[#E8EBF2] p-5">
          <h2 className="font-display text-base font-bold text-[#202A44]">
            Registered Donor Pool by Blood Group
          </h2>
          <p className="text-xs text-[#7B8499] mb-4">
            Total registered donors versus currently available donors
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.donorStats} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8EBF2" vertical={false} />
                <XAxis dataKey="bloodGroup" tick={{ fill: '#202A44', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#7B8499', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #E8EBF2', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="total" name="Registered Donors" fill="#7B8499" radius={[4, 4, 0, 0]} />
                <Bar dataKey="available" name="Available Donors" fill="#27AE75" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Low Stock Deficit Report */}
      <div className="rounded-xl bg-white border border-[#E8EBF2] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E8EBF2]">
          <h2 className="font-display text-base font-bold text-[#202A44]">
            Low-Stock Deficit Report
          </h2>
          <p className="text-xs text-[#7B8499]">
            Batches currently at or below their minimum safety threshold
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E8EBF2] bg-[#F4F6FA]/60 text-[11px] font-semibold text-[#7B8499]">
                <th className="py-3 px-4">Blood Bank</th>
                <th className="py-3 px-4">Blood Group</th>
                <th className="py-3 px-4 text-right">Available Units</th>
                <th className="py-3 px-4 text-right">Min Threshold</th>
                <th className="py-3 px-4 text-right">Shortage Deficit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EBF2] text-sm">
              {data.lowStockReport.map((row) => (
                <tr key={row.id}>
                  <td className="py-3 px-4 font-medium text-[#202A44]">{row.bankName}</td>
                  <td className="py-3 px-4">
                    <BloodGroupTag group={row.bloodGroup} />
                  </td>
                  <td className="py-3 px-4 text-right font-mono-tabular font-bold text-[#E53945]">
                    {row.unitsAvailable}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-tabular text-[#7B8499]">
                    {row.minimumThreshold}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-[#C97A16]">
                    {row.deficit} units below threshold
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
