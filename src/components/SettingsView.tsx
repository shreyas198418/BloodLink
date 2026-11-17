import React, { useCallback, useEffect, useState } from 'react';
import { Database, Play, Save, Shield, UserPlus } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { BloodBankItem } from '../types/bloodlink.ts';

interface SettingsPayload {
  settings: {
    minDonationIntervalDays: number;
    minDonorAge: number;
    maxDonorAge: number;
    defaultLowStockThreshold: number;
    emergencyWeight: number;
    urgentWeight: number;
    routineWeight: number;
  };
  staffUsers: Array<{
    id: string;
    email: string;
    fullName: string;
    role: string;
    bloodBankId: string | null;
    isActive: boolean;
  }>;
}

interface SqlDemoResult {
  title: string;
  concept: string;
  sql: string;
  rows: Array<Record<string, unknown>>;
}

export function SettingsView() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [policy, setPolicy] = useState({
    minDonationIntervalDays: 56,
    minDonorAge: 18,
    maxDonorAge: 65,
    defaultLowStockThreshold: 6,
    emergencyWeight: 100,
    urgentWeight: 60,
    routineWeight: 20,
  });
  const [staffUsers, setStaffUsers] = useState<SettingsPayload['staffUsers']>([]);
  const [banks, setBanks] = useState<BloodBankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newUser, setNewUser] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'STAFF',
    bloodBankId: '',
  });

  const [sqlDemo, setSqlDemo] = useState<SqlDemoResult | null>(null);
  const [runningDemo, setRunningDemo] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [setRes, bankRes] = await Promise.all([
        apiFetch<SettingsPayload>('/api/settings'),
        apiFetch<{ bloodBanks: BloodBankItem[] }>('/api/blood-banks'),
      ]);
      if (setRes.settings) {
        setPolicy(setRes.settings);
      }
      setStaffUsers(setRes.staffUsers || []);
      setBanks(bankRes.bloodBanks);
      setNewUser((prev) => ({
        ...prev,
        bloodBankId: prev.bloodBankId || bankRes.bloodBanks[0]?.id || '',
      }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function handleSavePolicy(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    try {
      await apiFetch('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify(policy),
      });
      setMsg('Screening policy & priority scoring weights saved to PostgreSQL.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    try {
      await apiFetch('/api/settings/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      setMsg(`Created ${newUser.role} account for ${newUser.email}.`);
      setNewUser({
        fullName: '',
        email: '',
        password: '',
        role: 'STAFF',
        bloodBankId: banks[0]?.id || '',
      });
      await loadSettings();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create staff account.');
    }
  }

  async function handleRunSqlDemo(demoKey: string) {
    setRunningDemo(true);
    setError(null);
    try {
      const res = await apiFetch<SqlDemoResult>('/api/settings/sql-demo', {
        method: 'POST',
        body: JSON.stringify({ demoKey }),
      });
      setSqlDemo(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to execute SQL demo.');
    } finally {
      setRunningDemo(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-sm text-[#7B8499]">Loading system settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#202A44]">
          System Settings, RBAC & DBMS Demonstrations
        </h1>
        <p className="text-sm text-[#7B8499]">
          Configure donor screening policy rules, priority weights, staff access accounts, and run live PostgreSQL + pgvector queries.
        </p>
      </div>

      {msg && (
        <div className="rounded-lg bg-[#EAF7F1] border border-[#27AE75]/30 px-4 py-2.5 text-xs font-semibold text-[#1E8E5E]">
          {msg}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-lg bg-[#FDEBEC] border border-[#E53945]/30 px-4 py-2.5 text-xs font-semibold text-[#E53945]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Screening Policy & Priority Weights */}
        <form
          onSubmit={handleSavePolicy}
          className="rounded-xl bg-white border border-[#E8EBF2] p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-[#202A44]">
              Eligibility Screening & Priority Policy
            </h2>
            <Shield className="h-4 w-4 text-[#101B3F]" aria-hidden="true" />
          </div>
          <p className="text-xs text-[#7B8499]">
            Configurable operational screening rules (not clinical medical clearance).
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="set-interval" className="block text-xs font-semibold text-[#202A44] mb-1">
                Min Donation Interval (Days)
              </label>
              <input
                id="set-interval"
                type="number"
                disabled={!isAdmin}
                value={policy.minDonationIntervalDays}
                onChange={(e) => setPolicy({ ...policy, minDonationIntervalDays: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm disabled:bg-[#F4F6FA]"
              />
            </div>
            <div>
              <label htmlFor="set-thresh" className="block text-xs font-semibold text-[#202A44] mb-1">
                Default Low Stock Threshold
              </label>
              <input
                id="set-thresh"
                type="number"
                disabled={!isAdmin}
                value={policy.defaultLowStockThreshold}
                onChange={(e) => setPolicy({ ...policy, defaultLowStockThreshold: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm disabled:bg-[#F4F6FA]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="set-minage" className="block text-xs font-semibold text-[#202A44] mb-1">
                Min Donor Age
              </label>
              <input
                id="set-minage"
                type="number"
                disabled={!isAdmin}
                value={policy.minDonorAge}
                onChange={(e) => setPolicy({ ...policy, minDonorAge: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm disabled:bg-[#F4F6FA]"
              />
            </div>
            <div>
              <label htmlFor="set-maxage" className="block text-xs font-semibold text-[#202A44] mb-1">
                Max Donor Age
              </label>
              <input
                id="set-maxage"
                type="number"
                disabled={!isAdmin}
                value={policy.maxDonorAge}
                onChange={(e) => setPolicy({ ...policy, maxDonorAge: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm disabled:bg-[#F4F6FA]"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="set-ew" className="block text-xs font-semibold text-[#202A44] mb-1">
                Emergency Weight
              </label>
              <input
                id="set-ew"
                type="number"
                disabled={!isAdmin}
                value={policy.emergencyWeight}
                onChange={(e) => setPolicy({ ...policy, emergencyWeight: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm disabled:bg-[#F4F6FA]"
              />
            </div>
            <div>
              <label htmlFor="set-uw" className="block text-xs font-semibold text-[#202A44] mb-1">
                Urgent Weight
              </label>
              <input
                id="set-uw"
                type="number"
                disabled={!isAdmin}
                value={policy.urgentWeight}
                onChange={(e) => setPolicy({ ...policy, urgentWeight: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm disabled:bg-[#F4F6FA]"
              />
            </div>
            <div>
              <label htmlFor="set-rw" className="block text-xs font-semibold text-[#202A44] mb-1">
                Routine Weight
              </label>
              <input
                id="set-rw"
                type="number"
                disabled={!isAdmin}
                value={policy.routineWeight}
                onChange={(e) => setPolicy({ ...policy, routineWeight: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm disabled:bg-[#F4F6FA]"
              />
            </div>
          </div>

          {isAdmin ? (
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#101B3F] hover:bg-[#17264F] text-xs font-semibold text-white"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              Save Policy Settings
            </button>
          ) : (
            <p className="text-xs text-[#7B8499]">
              Read-only view: Administrator role required to modify network policies.
            </p>
          )}
        </form>

        {/* Staff Account Management (Admin Only) */}
        <div className="rounded-xl bg-white border border-[#E8EBF2] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-[#202A44]">
              Staff & Role Accounts
            </h2>
            <UserPlus className="h-4 w-4 text-[#E53945]" aria-hidden="true" />
          </div>

          {!isAdmin ? (
            <div className="rounded-lg bg-[#F4F6FA] p-4 text-xs text-[#7B8499]">
              Signed in as <strong>{user?.fullName}</strong> ({user?.role}). Staff account provisioning is restricted to Administrators.
            </div>
          ) : (
            <>
              <div className="max-h-44 overflow-y-auto divide-y divide-[#E8EBF2] border border-[#E8EBF2] rounded-lg">
                {staffUsers.map((u) => (
                  <div key={u.id} className="px-3 py-2 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-[#202A44]">{u.fullName}</p>
                      <p className="text-[#7B8499] font-mono-tabular">{u.email}</p>
                    </div>
                    <span className="rounded-md bg-[#EEF1F7] px-2 py-0.5 font-semibold text-[#101B3F]">
                      {u.role}
                    </span>
                  </div>
                ))}
              </div>

              <form onSubmit={handleCreateUser} className="space-y-3 pt-2 border-t border-[#E8EBF2]">
                <p className="text-xs font-semibold text-[#202A44]">Create New Staff / Admin Account</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    aria-label="New user full name"
                    value={newUser.fullName}
                    onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                    placeholder="Full Name"
                    className="h-9 px-3 rounded-lg border border-[#E8EBF2] text-xs"
                  />
                  <input
                    type="email"
                    aria-label="New user email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="staff@bloodlink.org"
                    className="h-9 px-3 rounded-lg border border-[#E8EBF2] text-xs"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <input
                    type="password"
                    aria-label="New user password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="Password (6+ chars)"
                    className="h-9 px-3 rounded-lg border border-[#E8EBF2] text-xs"
                  />
                  <select
                    aria-label="New user role"
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    className="h-9 px-2 rounded-lg border border-[#E8EBF2] text-xs bg-white"
                  >
                    <option value="STAFF">STAFF</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                  <select
                    aria-label="Assigned blood bank"
                    value={newUser.bloodBankId}
                    disabled={newUser.role === 'ADMIN'}
                    onChange={(e) => setNewUser({ ...newUser, bloodBankId: e.target.value })}
                    className="h-9 px-2 rounded-lg border border-[#E8EBF2] text-xs bg-white disabled:bg-[#F4F6FA]"
                  >
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#E53945] text-xs font-semibold text-white"
                >
                  Provision Account
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Live Advanced PostgreSQL & pgvector Demonstration Console (Admin Only) */}
      {isAdmin && (
        <div className="rounded-xl bg-white border border-[#E8EBF2] p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Database className="h-4.5 w-4.5 text-[#E53945]" aria-hidden="true" />
              <div>
                <h2 className="font-display text-base font-bold text-[#202A44]">
                  Advanced PostgreSQL & pgvector Query Demonstrations
                </h2>
                <p className="text-xs text-[#7B8499]">
                  Execute live read-only analytical SQL & vector similarity queries against Cloud SQL PostgreSQL.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { key: 'join_group_having', label: 'JOIN + GROUP BY + HAVING' },
              { key: 'subquery_priority', label: 'Scalar Subquery + ORDER BY' },
              { key: 'pgvector_similarity', label: 'pgvector Cosine Similarity (<=>)' },
              { key: 'audit_trail_join', label: 'Transaction Ledger Multi-JOIN' },
              { key: 'schema_metadata', label: 'Constraints & Keys Catalog' },
            ].map((demo) => (
              <button
                key={demo.key}
                type="button"
                disabled={runningDemo}
                onClick={() => handleRunSqlDemo(demo.key)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E8EBF2] bg-[#F4F6FA] hover:border-[#101B3F] text-xs font-semibold text-[#202A44]"
              >
                <Play className="h-3.5 w-3.5 text-[#E53945]" aria-hidden="true" />
                {demo.label}
              </button>
            ))}
          </div>

          {sqlDemo && (
            <div className="space-y-3 pt-2">
              <div className="rounded-lg bg-[#101B3F] text-slate-100 p-4 text-xs">
                <p className="font-semibold text-white mb-1">{sqlDemo.title}</p>
                <p className="text-slate-300 mb-2">{sqlDemo.concept}</p>
                <pre className="font-mono-tabular overflow-x-auto text-[11px] text-emerald-300 leading-relaxed">
                  {sqlDemo.sql}
                </pre>
              </div>

              <div className="overflow-x-auto border border-[#E8EBF2] rounded-lg">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E8EBF2] bg-[#F4F6FA] text-[11px] font-semibold text-[#7B8499]">
                      {sqlDemo.rows[0] &&
                        Object.keys(sqlDemo.rows[0]).map((col) => (
                          <th key={col} className="py-2.5 px-3 font-mono-tabular">
                            {col}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8EBF2] text-xs">
                    {sqlDemo.rows.map((row, idx) => (
                      <tr key={idx}>
                        {Object.values(row).map((val, cIdx) => (
                          <td key={cIdx} className="py-2 px-3 font-mono-tabular text-[#202A44]">
                            {String(val ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
