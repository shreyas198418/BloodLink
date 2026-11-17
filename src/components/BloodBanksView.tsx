import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Mail, MapPin, Phone, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { BloodBankItem } from '../types/bloodlink.ts';
import { BloodGroupTag, StockStatusLabel } from './StatusBadges.tsx';

export function BloodBanksView() {
  const { user } = useAuth();
  const [banks, setBanks] = useState<BloodBankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bankForm, setBankForm] = useState({
    name: '',
    city: '',
    address: '',
    contactNumber: '',
    email: '',
    operatingStatus: 'Active',
  });

  const loadBanks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ bloodBanks: BloodBankItem[] }>('/api/blood-banks');
      setBanks(res.bloodBanks);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load blood banks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBanks();
  }, [loadBanks]);

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiFetch('/api/blood-banks', {
        method: 'POST',
        body: JSON.stringify(bankForm),
      });
      setShowAddModal(false);
      setActionMsg(`Added blood bank ${bankForm.name}.`);
      setBankForm({
        name: '',
        city: '',
        address: '',
        contactNumber: '',
        email: '',
        operatingStatus: 'Active',
      });
      await loadBanks();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create blood bank.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusToggle(bank: BloodBankItem, nextStatus: string) {
    try {
      await apiFetch(`/api/blood-banks/${bank.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ operatingStatus: nextStatus }),
      });
      setActionMsg(`Updated ${bank.name} status to ${nextStatus}.`);
      await loadBanks();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update blood bank.');
    }
  }

  async function handleDeleteBank(bank: BloodBankItem) {
    setError(null);
    try {
      await apiFetch(`/api/blood-banks/${bank.id}`, { method: 'DELETE' });
      setActionMsg(`Deleted blood bank ${bank.name}.`);
      await loadBanks();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Cannot delete blood bank.');
    }
  }

  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#202A44]">
            Regional Blood Banks
          </h1>
          <p className="text-sm text-[#7B8499]">
            Directory of participating blood bank facilities, live stock capacity, and operating statuses.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#E53945] hover:bg-[#cf2d38] text-xs font-semibold text-white transition-colors whitespace-nowrap self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Blood Bank
          </button>
        )}
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

      {loading ? (
        <div className="p-8 text-center text-sm text-[#7B8499]">Loading blood banks...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {banks.map((bank) => (
            <div
              key={bank.id}
              className="rounded-xl bg-white border border-[#E8EBF2] p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-[#EEF1F7] text-[#101B3F] flex items-center justify-center shrink-0">
                      <Building2 className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <span className="font-mono-tabular text-xs font-semibold text-[#7B8499]">
                        {bank.bankCode}
                      </span>
                      <h2 className="font-display text-base font-bold text-[#202A44]">
                        {bank.name}
                      </h2>
                    </div>
                  </div>

                  <StockStatusLabel
                    status={
                      bank.operatingStatus === 'Active'
                        ? 'Available'
                        : bank.operatingStatus === 'Limited'
                          ? 'Limited'
                          : 'Critical'
                    }
                  />
                </div>

                <div className="mt-4 space-y-1.5 text-xs text-[#7B8499]">
                  <p className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{bank.address}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="font-mono-tabular">{bank.contactNumber}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{bank.email}</span>
                  </p>
                </div>

                <div className="mt-4 pt-4 border-t border-[#E8EBF2]">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-semibold text-[#202A44]">
                      Available Groups ({bank.totalUnits} valid units)
                    </span>
                    {bank.lowStockBatches > 0 && (
                      <span className="font-semibold text-[#C97A16]">
                        {bank.lowStockBatches} low stock
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {bank.availableBloodGroups.length > 0 ? (
                      bank.availableBloodGroups.map((bg) => (
                        <BloodGroupTag key={bg} group={bg} />
                      ))
                    ) : (
                      <span className="text-xs text-[#7B8499]">No active stock</span>
                    )}
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="pt-3 border-t border-[#E8EBF2] flex items-center justify-between gap-2">
                  <select
                    aria-label={`Operating status for ${bank.name}`}
                    value={bank.operatingStatus}
                    onChange={(e) => handleStatusToggle(bank, e.target.value)}
                    className="h-8 px-2.5 rounded-md border border-[#E8EBF2] bg-white text-xs font-medium text-[#202A44]"
                  >
                    <option value="Active">Operating: Active</option>
                    <option value="Limited">Operating: Limited</option>
                    <option value="Closed">Operating: Closed</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => handleDeleteBank(bank)}
                    aria-label={`Delete ${bank.name}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#E8EBF2] hover:border-[#E53945] text-xs font-medium text-[#7B8499] hover:text-[#E53945]"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-[#101B3F]/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-label="Add Blood Bank"
            className="w-full max-w-md rounded-2xl bg-white border border-[#E8EBF2] p-6 shadow-xl"
          >
            <h2 className="font-display text-lg font-bold text-[#202A44]">
              Register Blood Bank Facility
            </h2>

            {formError && (
              <div role="alert" className="mt-3 rounded-lg bg-[#FDEBEC] px-3 py-2 text-xs font-medium text-[#E53945]">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-3.5">
              <div>
                <label htmlFor="bb-name" className="block text-xs font-semibold text-[#202A44] mb-1">
                  Bank Name
                </label>
                <input
                  id="bb-name"
                  type="text"
                  value={bankForm.name}
                  onChange={(e) => setBankForm({ ...bankForm, name: e.target.value })}
                  placeholder="Northgate Regional Blood Bank"
                  className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bb-city" className="block text-xs font-semibold text-[#202A44] mb-1">
                    City / Region
                  </label>
                  <input
                    id="bb-city"
                    type="text"
                    value={bankForm.city}
                    onChange={(e) => setBankForm({ ...bankForm, city: e.target.value })}
                    placeholder="Northgate"
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="bb-status" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Status
                  </label>
                  <select
                    id="bb-status"
                    value={bankForm.operatingStatus}
                    onChange={(e) => setBankForm({ ...bankForm, operatingStatus: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm bg-white"
                  >
                    <option value="Active">Active</option>
                    <option value="Limited">Limited</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="bb-addr" className="block text-xs font-semibold text-[#202A44] mb-1">
                  Address
                </label>
                <input
                  id="bb-addr"
                  type="text"
                  value={bankForm.address}
                  onChange={(e) => setBankForm({ ...bankForm, address: e.target.value })}
                  placeholder="200 Health Plaza"
                  className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bb-phone" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Contact Phone
                  </label>
                  <input
                    id="bb-phone"
                    type="tel"
                    value={bankForm.contactNumber}
                    onChange={(e) => setBankForm({ ...bankForm, contactNumber: e.target.value })}
                    placeholder="+65 6555 8811"
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="bb-email" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Facility Email
                  </label>
                  <input
                    id="bb-email"
                    type="email"
                    value={bankForm.email}
                    onChange={(e) => setBankForm({ ...bankForm, email: e.target.value })}
                    placeholder="northgate@bloodlink.org"
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg border border-[#E8EBF2] text-xs font-semibold text-[#7B8499]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-[#E53945] text-xs font-semibold text-white"
                >
                  {submitting ? 'Saving...' : 'Create Bank'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
