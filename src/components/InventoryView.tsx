import React, { useCallback, useEffect, useState } from 'react';
import { History, PackagePlus, Search, Trash2, Wrench } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { BLOOD_GROUPS } from '../lib/blood-compatibility.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  BloodBankItem,
  InventoryItem,
  InventoryTransactionItem,
} from '../types/bloodlink.ts';
import { BloodGroupTag, StockStatusLabel } from './StatusBadges.tsx';

export function InventoryView({
  initialOpenCreate = false,
  onConsumedOpenCreate,
}: {
  initialOpenCreate?: boolean;
  onConsumedOpenCreate?: () => void;
}) {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [banks, setBanks] = useState<BloodBankItem[]>([]);
  const [groupSummary, setGroupSummary] = useState<
    Array<{ bloodGroup: string; validUnits: number; expiredUnits: number }>
  >([]);
  const [transactions, setTransactions] = useState<InventoryTransactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [tab, setTab] = useState<'batches' | 'history'>('batches');
  const [bloodGroupFilter, setBloodGroupFilter] = useState('ALL');
  const [bankFilter, setBankFilter] = useState('ALL');
  const [expiryFilter, setExpiryFilter] = useState('ALL');
  const [searchText, setSearchText] = useState('');

  // Add batch modal
  const [showAddModal, setShowAddModal] = useState(initialOpenCreate);
  const [addForm, setAddForm] = useState({
    bloodBankId: user?.bloodBankId || '',
    bloodGroup: 'O+',
    unitsAvailable: 10,
    minimumThreshold: 5,
    collectionDate: new Date().toISOString().slice(0, 10),
    expiryDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Adjust stock modal
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [adjustUnits, setAdjustUnits] = useState<number>(0);
  const [adjustThreshold, setAdjustThreshold] = useState<number>(5);
  const [adjustNotes, setAdjustNotes] = useState('');

  useEffect(() => {
    if (initialOpenCreate) {
      setShowAddModal(true);
      onConsumedOpenCreate?.();
    }
  }, [initialOpenCreate, onConsumedOpenCreate]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (bloodGroupFilter !== 'ALL') params.set('bloodGroup', bloodGroupFilter);
      if (bankFilter !== 'ALL') params.set('bankId', bankFilter);
      if (expiryFilter !== 'ALL') params.set('expiryFilter', expiryFilter);

      const [invRes, bankRes] = await Promise.all([
        apiFetch<{
          inventory: InventoryItem[];
          groupSummary: Array<{ bloodGroup: string; validUnits: number; expiredUnits: number }>;
          transactions: InventoryTransactionItem[];
        }>(`/api/inventory?${params.toString()}`),
        apiFetch<{ bloodBanks: BloodBankItem[] }>('/api/blood-banks'),
      ]);

      setInventory(invRes.inventory);
      setGroupSummary(invRes.groupSummary);
      setTransactions(invRes.transactions);
      setBanks(bankRes.bloodBanks);
      setAddForm((prev) => ({
        ...prev,
        bloodBankId: prev.bloodBankId || user?.bloodBankId || bankRes.bloodBanks[0]?.id || '',
      }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  }, [bloodGroupFilter, bankFilter, expiryFilter, user?.bloodBankId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiFetch('/api/inventory', {
        method: 'POST',
        body: JSON.stringify(addForm),
      });
      setShowAddModal(false);
      setActionMsg(`Added ${addForm.unitsAvailable} units of ${addForm.bloodGroup} blood.`);
      await loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to add inventory batch.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdjustSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustItem) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/api/inventory/${adjustItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          unitsAvailable: adjustUnits,
          minimumThreshold: adjustThreshold,
          notes: adjustNotes,
        }),
      });
      setAdjustItem(null);
      setActionMsg(`Updated ${adjustItem.bloodGroup} stock at ${adjustItem.bankName}.`);
      await loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to adjust inventory.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteBatch(item: InventoryItem) {
    setFormError(null);
    setActionMsg(null);
    try {
      await apiFetch(`/api/inventory/${item.id}`, { method: 'DELETE' });
      setActionMsg(`Removed batch ${item.bloodGroup} from ${item.bankName}.`);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Cannot remove inventory batch.');
    }
  }

  const visibleInventory = inventory.filter((item) => {
    if (!searchText.trim()) return true;
    const q = searchText.toLowerCase();
    return (
      item.bankName.toLowerCase().includes(q) ||
      item.bloodGroup.toLowerCase().includes(q) ||
      item.bankCity.toLowerCase().includes(q)
    );
  });

  const canModifyBank = (bankId: string) =>
    user?.role === 'ADMIN' || user?.bloodBankId === bankId;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#202A44]">
            Multi-Bank Blood Inventory
          </h1>
          <p className="text-sm text-[#7B8499]">
            Monitor reserves across all blood banks, isolate expired stock, and audit every unit change.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setShowAddModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#E53945] hover:bg-[#cf2d38] text-xs font-semibold text-white transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <PackagePlus className="h-4 w-4" aria-hidden="true" />
          Add Inventory Batch
        </button>
      </div>

      {actionMsg && (
        <div className="rounded-lg bg-[#EAF7F1] border border-[#27AE75]/30 px-4 py-2.5 text-xs font-semibold text-[#1E8E5E] flex items-center justify-between">
          <span>{actionMsg}</span>
          <button type="button" onClick={() => setActionMsg(null)} className="underline">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg bg-[#FDEBEC] border border-[#E53945]/30 px-4 py-2.5 text-xs font-semibold text-[#E53945]">
          {error}
        </div>
      )}

      {/* Group Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {groupSummary.map((g) => (
          <div
            key={g.bloodGroup}
            className="rounded-xl bg-white border border-[#E8EBF2] p-3.5 text-center"
          >
            <BloodGroupTag group={g.bloodGroup} />
            <p className="mt-2 font-display text-xl font-bold text-[#202A44] tabular-nums">
              {g.validUnits}
            </p>
            <p className="text-[11px] text-[#7B8499]">
              valid units{g.expiredUnits > 0 ? ` · ${g.expiredUnits} exp` : ''}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs & Filters */}
      <div className="rounded-xl bg-white border border-[#E8EBF2] overflow-hidden">
        <div className="p-4 border-b border-[#E8EBF2] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="inline-flex rounded-lg bg-[#F4F6FA] p-1 self-start">
            <button
              type="button"
              onClick={() => setTab('batches')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === 'batches'
                  ? 'bg-white text-[#101B3F] shadow-sm'
                  : 'text-[#7B8499] hover:text-[#202A44]'
              }`}
            >
              Inventory Batches ({visibleInventory.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === 'history'
                  ? 'bg-white text-[#101B3F] shadow-sm'
                  : 'text-[#7B8499] hover:text-[#202A44]'
              }`}
            >
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              Transaction Ledger ({transactions.length})
            </button>
          </div>

          {tab === 'batches' && (
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-[#7B8499] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Search inventory by bank or group"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search bank or city..."
                  className="h-9 pl-8 pr-3 rounded-lg border border-[#E8EBF2] text-xs text-[#202A44] focus:outline-none focus:border-[#101B3F]"
                />
              </div>

              <select
                aria-label="Filter by blood group"
                value={bloodGroupFilter}
                onChange={(e) => setBloodGroupFilter(e.target.value)}
                className="h-9 px-3 rounded-lg border border-[#E8EBF2] text-xs font-medium text-[#202A44] bg-white"
              >
                <option value="ALL">All Blood Groups</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by blood bank"
                value={bankFilter}
                onChange={(e) => setBankFilter(e.target.value)}
                className="h-9 px-3 rounded-lg border border-[#E8EBF2] text-xs font-medium text-[#202A44] bg-white"
              >
                <option value="ALL">All Blood Banks</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by expiry or alert status"
                value={expiryFilter}
                onChange={(e) => setExpiryFilter(e.target.value)}
                className="h-9 px-3 rounded-lg border border-[#E8EBF2] text-xs font-medium text-[#202A44] bg-white"
              >
                <option value="ALL">All Batches</option>
                <option value="VALID">Valid Non-Expired</option>
                <option value="LOW_STOCK">Low Stock Alerts</option>
                <option value="EXPIRED">Expired Quarantined</option>
              </select>
            </div>
          )}
        </div>

        {tab === 'batches' ? (
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-8 text-center text-sm text-[#7B8499]">Loading blood inventory...</div>
            ) : visibleInventory.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#7B8499]">
                No inventory batches match the selected filters.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E8EBF2] bg-[#F4F6FA]/60 text-[11px] font-semibold text-[#7B8499]">
                    <th className="py-3 px-4">Blood Bank</th>
                    <th className="py-3 px-4">Group</th>
                    <th className="py-3 px-4 text-right">Units Available</th>
                    <th className="py-3 px-4 text-right">Min Threshold</th>
                    <th className="py-3 px-4">Collected</th>
                    <th className="py-3 px-4">Expiry Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8EBF2] text-sm">
                  {visibleInventory.map((item) => {
                    const editable = canModifyBank(item.bloodBankId);
                    return (
                      <tr key={item.id} className="hover:bg-[#F4F6FA]/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#202A44]">{item.bankName}</div>
                          <div className="text-xs text-[#7B8499]">{item.bankCity}</div>
                        </td>
                        <td className="py-3 px-4">
                          <BloodGroupTag group={item.bloodGroup} />
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular font-bold text-[#202A44]">
                          {item.unitsAvailable}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-xs text-[#7B8499]">
                          {item.minimumThreshold}
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-xs text-[#7B8499]">
                          {item.collectionDate}
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-xs font-medium text-[#202A44]">
                          {item.expiryDate}
                        </td>
                        <td className="py-3 px-4">
                          <StockStatusLabel status={item.inventoryStatus} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          {editable ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setFormError(null);
                                  setAdjustItem(item);
                                  setAdjustUnits(item.unitsAvailable);
                                  setAdjustThreshold(item.minimumThreshold);
                                  setAdjustNotes('');
                                }}
                                aria-label={`Adjust stock for ${item.bloodGroup} at ${item.bankName}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#E8EBF2] hover:border-[#101B3F] text-xs font-medium text-[#202A44]"
                              >
                                <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                                Adjust
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteBatch(item)}
                                aria-label={`Remove batch ${item.bloodGroup} at ${item.bankName}`}
                                className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-[#E8EBF2] hover:border-[#E53945] text-[#7B8499] hover:text-[#E53945]"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-[#7B8499]">Read-only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E8EBF2] bg-[#F4F6FA]/60 text-[11px] font-semibold text-[#7B8499]">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Blood Bank</th>
                  <th className="py-3 px-4 text-right">Delta</th>
                  <th className="py-3 px-4 text-right">Units After</th>
                  <th className="py-3 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EBF2] text-sm">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[#F4F6FA]/50">
                    <td className="py-3 px-4 font-mono-tabular text-xs text-[#7B8499] whitespace-nowrap">
                      {new Date(tx.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex rounded-md bg-[#EEF1F7] px-2 py-0.5 font-mono-tabular text-xs font-semibold text-[#101B3F]">
                        {tx.transactionType}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-[#202A44]">{tx.bankName}</td>
                    <td
                      className={`py-3 px-4 text-right font-mono-tabular font-bold ${
                        tx.unitsDelta >= 0 ? 'text-[#27AE75]' : 'text-[#E53945]'
                      }`}
                    >
                      {tx.unitsDelta >= 0 ? `+${tx.unitsDelta}` : tx.unitsDelta}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular font-semibold">
                      {tx.unitsAfter}
                    </td>
                    <td className="py-3 px-4 text-xs text-[#7B8499]">{tx.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Inventory Batch Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-[#101B3F]/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-label="Add Blood Inventory Batch"
            className="w-full max-w-lg rounded-2xl bg-white border border-[#E8EBF2] p-6 shadow-xl"
          >
            <h2 className="font-display text-lg font-bold text-[#202A44]">
              Add Blood Inventory Batch
            </h2>
            <p className="mt-1 text-xs text-[#7B8499]">
              Every addition is recorded in the inventory transaction audit ledger.
            </p>

            {formError && (
              <div role="alert" className="mt-3 rounded-lg bg-[#FDEBEC] px-3 py-2 text-xs font-medium text-[#E53945]">
                {formError}
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="inv-bank" className="block text-xs font-semibold text-[#202A44] mb-1">
                  Blood Bank
                </label>
                <select
                  id="inv-bank"
                  value={addForm.bloodBankId}
                  disabled={user?.role === 'STAFF' && Boolean(user.bloodBankId)}
                  onChange={(e) => setAddForm({ ...addForm, bloodBankId: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm bg-white disabled:bg-[#F4F6FA]"
                >
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.city})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="inv-group" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Blood Group
                  </label>
                  <select
                    id="inv-group"
                    value={addForm.bloodGroup}
                    onChange={(e) => setAddForm({ ...addForm, bloodGroup: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm bg-white"
                  >
                    {BLOOD_GROUPS.map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="inv-units" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Units
                  </label>
                  <input
                    id="inv-units"
                    type="number"
                    min={0}
                    value={addForm.unitsAvailable}
                    onChange={(e) => setAddForm({ ...addForm, unitsAvailable: Number(e.target.value) })}
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="inv-threshold" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Min Threshold
                  </label>
                  <input
                    id="inv-threshold"
                    type="number"
                    min={0}
                    value={addForm.minimumThreshold}
                    onChange={(e) => setAddForm({ ...addForm, minimumThreshold: Number(e.target.value) })}
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="inv-collected" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Collection Date
                  </label>
                  <input
                    id="inv-collected"
                    type="date"
                    value={addForm.collectionDate}
                    onChange={(e) => setAddForm({ ...addForm, collectionDate: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="inv-expiry" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Expiry Date
                  </label>
                  <input
                    id="inv-expiry"
                    type="date"
                    value={addForm.expiryDate}
                    onChange={(e) => setAddForm({ ...addForm, expiryDate: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg border border-[#E8EBF2] text-xs font-semibold text-[#7B8499] hover:text-[#202A44]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-[#E53945] hover:bg-[#cf2d38] text-xs font-semibold text-white"
                >
                  {submitting ? 'Saving...' : 'Save Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {adjustItem && (
        <div className="fixed inset-0 z-50 bg-[#101B3F]/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-label="Adjust Blood Inventory Stock"
            className="w-full max-w-md rounded-2xl bg-white border border-[#E8EBF2] p-6 shadow-xl"
          >
            <h2 className="font-display text-lg font-bold text-[#202A44]">
              Adjust Stock — {adjustItem.bloodGroup} ({adjustItem.bankName})
            </h2>

            {formError && (
              <div role="alert" className="mt-3 rounded-lg bg-[#FDEBEC] px-3 py-2 text-xs font-medium text-[#E53945]">
                {formError}
              </div>
            )}

            <form onSubmit={handleAdjustSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="adj-units" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Updated Units
                  </label>
                  <input
                    id="adj-units"
                    type="number"
                    value={adjustUnits}
                    onChange={(e) => setAdjustUnits(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="adj-threshold" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Min Threshold
                  </label>
                  <input
                    id="adj-threshold"
                    type="number"
                    min={0}
                    value={adjustThreshold}
                    onChange={(e) => setAdjustThreshold(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="adj-notes" className="block text-xs font-semibold text-[#202A44] mb-1">
                  Audit Notes
                </label>
                <input
                  id="adj-notes"
                  type="text"
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  placeholder="Reason for restock or adjustment"
                  className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustItem(null)}
                  className="px-4 py-2 rounded-lg border border-[#E8EBF2] text-xs font-semibold text-[#7B8499]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-[#101B3F] text-xs font-semibold text-white"
                >
                  {submitting ? 'Updating...' : 'Confirm Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
