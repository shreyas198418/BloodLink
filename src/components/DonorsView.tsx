import React, { useCallback, useEffect, useState } from 'react';
import { Lock, Search, UserPlus, UserX } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import {
  BLOOD_GROUPS,
  evaluateDonorScreeningEligibility,
} from '../lib/blood-compatibility.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { BloodBankItem, DonorItem } from '../types/bloodlink.ts';
import { BloodGroupTag, StockStatusLabel } from './StatusBadges.tsx';

export function DonorsView({
  initialOpenCreate = false,
  onConsumedOpenCreate,
}: {
  initialOpenCreate?: boolean;
  onConsumedOpenCreate?: () => void;
}) {
  const { user } = useAuth();
  const [donorsList, setDonorsList] = useState<DonorItem[]>([]);
  const [banks, setBanks] = useState<BloodBankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [bloodGroupFilter, setBloodGroupFilter] = useState('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState('ALL');
  const [searchText, setSearchText] = useState('');

  const [showRegisterModal, setShowRegisterModal] = useState(initialOpenCreate);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [donorForm, setDonorForm] = useState({
    fullName: '',
    dateOfBirth: '1994-06-15',
    bloodGroup: 'O+',
    phoneNumber: '',
    email: '',
    city: 'Central District',
    address: '',
    lastDonationDate: '',
    availabilityStatus: 'Available',
    associatedBankId: user?.bloodBankId || '',
  });

  useEffect(() => {
    if (initialOpenCreate) {
      setShowRegisterModal(true);
      onConsumedOpenCreate?.();
    }
  }, [initialOpenCreate, onConsumedOpenCreate]);

  const loadDonors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (bloodGroupFilter !== 'ALL') params.set('bloodGroup', bloodGroupFilter);
      if (availabilityFilter !== 'ALL') params.set('availability', availabilityFilter);
      if (searchText.trim()) params.set('search', searchText.trim());

      const [donorRes, bankRes] = await Promise.all([
        apiFetch<{ donors: DonorItem[] }>(`/api/donors?${params.toString()}`),
        apiFetch<{ bloodBanks: BloodBankItem[] }>('/api/blood-banks'),
      ]);

      setDonorsList(donorRes.donors);
      setBanks(bankRes.bloodBanks);
      setDonorForm((prev) => ({
        ...prev,
        associatedBankId: prev.associatedBankId || user?.bloodBankId || bankRes.bloodBanks[0]?.id || '',
      }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load donors.');
    } finally {
      setLoading(false);
    }
  }, [bloodGroupFilter, availabilityFilter, searchText, user?.bloodBankId]);

  useEffect(() => {
    loadDonors();
  }, [loadDonors]);

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiFetch('/api/donors', {
        method: 'POST',
        body: JSON.stringify(donorForm),
      });
      setShowRegisterModal(false);
      setActionMsg(`Registered donor ${donorForm.fullName} (${donorForm.bloodGroup}).`);
      setDonorForm({
        fullName: '',
        dateOfBirth: '1994-06-15',
        bloodGroup: 'O+',
        phoneNumber: '',
        email: '',
        city: 'Central District',
        address: '',
        lastDonationDate: '',
        availabilityStatus: 'Available',
        associatedBankId: user?.bloodBankId || banks[0]?.id || '',
      });
      await loadDonors();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to register donor.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleAvailability(donor: DonorItem) {
    const nextStatus = donor.availabilityStatus === 'Available' ? 'Unavailable' : 'Available';
    try {
      await apiFetch(`/api/donors/${donor.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ availabilityStatus: nextStatus }),
      });
      setActionMsg(`Updated ${donor.fullName} status to ${nextStatus}.`);
      await loadDonors();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update donor status.');
    }
  }

  async function handleDeactivate(donor: DonorItem) {
    try {
      await apiFetch(`/api/donors/${donor.id}`, { method: 'DELETE' });
      setActionMsg(`Deactivated donor profile ${donor.donorCode}.`);
      await loadDonors();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate donor.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#202A44]">
            Donor Registry & Screening
          </h1>
          <p className="text-sm text-[#7B8499]">
            RBAC-protected donor directory with automated 56-day donation interval screening indicators.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setShowRegisterModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#E53945] hover:bg-[#cf2d38] text-xs font-semibold text-white transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Register Donor
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

      <div className="rounded-xl bg-white border border-[#E8EBF2] overflow-hidden">
        <div className="p-4 border-b border-[#E8EBF2] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-[#7B8499] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="search"
                aria-label="Search donors"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Name, code, or city..."
                className="h-9 pl-8 pr-3 rounded-lg border border-[#E8EBF2] text-xs text-[#202A44] focus:outline-none focus:border-[#101B3F]"
              />
            </div>

            <select
              aria-label="Filter donors by blood group"
              value={bloodGroupFilter}
              onChange={(e) => setBloodGroupFilter(e.target.value)}
              className="h-9 px-3 rounded-lg border border-[#E8EBF2] text-xs font-medium bg-white"
            >
              <option value="ALL">All Blood Groups</option>
              {BLOOD_GROUPS.map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter donors by availability"
              value={availabilityFilter}
              onChange={(e) => setAvailabilityFilter(e.target.value)}
              className="h-9 px-3 rounded-lg border border-[#E8EBF2] text-xs font-medium bg-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="Available">Available</option>
              <option value="Unavailable">Unavailable</option>
              <option value="Deferred">Deferred</option>
            </select>
          </div>

          <span className="text-xs text-[#7B8499] tabular-nums">
            Showing {donorsList.length} active donors
          </span>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-[#7B8499]">Loading donor directory...</div>
          ) : donorsList.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#7B8499]">No donors match the current filter.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E8EBF2] bg-[#F4F6FA]/60 text-[11px] font-semibold text-[#7B8499]">
                  <th className="py-3 px-4">Donor</th>
                  <th className="py-3 px-4">Group</th>
                  <th className="py-3 px-4">City & Bank</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Last Donation</th>
                  <th className="py-3 px-4">Screening Rule</th>
                  <th className="py-3 px-4">Availability</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EBF2] text-sm">
                {donorsList.map((d) => {
                  const screening = evaluateDonorScreeningEligibility({
                    dateOfBirth: d.dateOfBirth,
                    lastDonationDate: d.lastDonationDate,
                    availabilityStatus: d.availabilityStatus,
                    isActive: true,
                  });
                  const canEdit =
                    user?.role === 'ADMIN' ||
                    (user?.bloodBankId && d.associatedBankId === user.bloodBankId);

                  return (
                    <tr key={d.id} className="hover:bg-[#F4F6FA]/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#202A44]">{d.fullName}</div>
                        <div className="font-mono-tabular text-xs text-[#7B8499]">
                          {d.donorCode} · Age {screening.age}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <BloodGroupTag group={d.bloodGroup} />
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-xs font-medium text-[#202A44]">{d.city}</div>
                        <div className="text-xs text-[#7B8499]">{d.associatedBankName || 'Unassigned'}</div>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <div className="font-mono-tabular text-[#202A44] flex items-center gap-1">
                          {d.privacyMasked && <Lock className="h-3 w-3 text-[#7B8499]" aria-hidden="true" />}
                          {d.phoneNumber}
                        </div>
                        <div className="text-[#7B8499] truncate max-w-[180px]">{d.email}</div>
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-xs text-[#7B8499]">
                        {d.lastDonationDate || 'Never'}
                      </td>
                      <td className="py-3 px-4">
                        {screening.eligible ? (
                          <StockStatusLabel status="Screening Clear" />
                        ) : (
                          <span
                            title={screening.reasons.join('; ')}
                            className="inline-flex items-center rounded-md bg-[#FEF5E7] px-2 py-0.5 text-xs font-medium text-[#C97A16]"
                          >
                            Ineligible ({screening.daysSinceLastDonation !== null ? `${screening.daysSinceLastDonation}d` : d.availabilityStatus})
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <StockStatusLabel
                          status={
                            d.availabilityStatus === 'Available'
                              ? 'Available'
                              : d.availabilityStatus === 'Deferred'
                                ? 'Critical'
                                : 'Limited'
                          }
                        />
                      </td>
                      <td className="py-3 px-4 text-right">
                        {canEdit ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleAvailability(d)}
                              className="px-2.5 py-1.5 rounded-md border border-[#E8EBF2] hover:border-[#101B3F] text-xs font-medium text-[#202A44] whitespace-nowrap"
                            >
                              {d.availabilityStatus === 'Available' ? 'Set Unavailable' : 'Set Available'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeactivate(d)}
                              aria-label={`Deactivate donor ${d.fullName}`}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-[#E8EBF2] hover:border-[#E53945] text-[#7B8499] hover:text-[#E53945]"
                            >
                              <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-[#7B8499]">Protected</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Register Donor Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 bg-[#101B3F]/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-label="Register New Donor"
            className="w-full max-w-lg rounded-2xl bg-white border border-[#E8EBF2] p-6 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <h2 className="font-display text-lg font-bold text-[#202A44]">
              Register Voluntary Donor
            </h2>
            <p className="mt-1 text-xs text-[#7B8499]">
              Duplicate email or phone registrations are blocked automatically.
            </p>

            {formError && (
              <div role="alert" className="mt-3 rounded-lg bg-[#FDEBEC] px-3 py-2 text-xs font-medium text-[#E53945]">
                {formError}
              </div>
            )}

            <form onSubmit={handleRegisterSubmit} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="dnr-name" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Full Name
                  </label>
                  <input
                    id="dnr-name"
                    type="text"
                    value={donorForm.fullName}
                    onChange={(e) => setDonorForm({ ...donorForm, fullName: e.target.value })}
                    placeholder="Jordan Patel"
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="dnr-dob" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Date of Birth
                  </label>
                  <input
                    id="dnr-dob"
                    type="date"
                    value={donorForm.dateOfBirth}
                    onChange={(e) => setDonorForm({ ...donorForm, dateOfBirth: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="dnr-group" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Blood Group
                  </label>
                  <select
                    id="dnr-group"
                    value={donorForm.bloodGroup}
                    onChange={(e) => setDonorForm({ ...donorForm, bloodGroup: e.target.value })}
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
                  <label htmlFor="dnr-phone" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Phone Number
                  </label>
                  <input
                    id="dnr-phone"
                    type="tel"
                    value={donorForm.phoneNumber}
                    onChange={(e) => setDonorForm({ ...donorForm, phoneNumber: e.target.value })}
                    placeholder="+65 9123 4567"
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="dnr-email" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Email
                  </label>
                  <input
                    id="dnr-email"
                    type="email"
                    value={donorForm.email}
                    onChange={(e) => setDonorForm({ ...donorForm, email: e.target.value })}
                    placeholder="jordan.patel@example.org"
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="dnr-city" className="block text-xs font-semibold text-[#202A44] mb-1">
                    City / District
                  </label>
                  <input
                    id="dnr-city"
                    type="text"
                    value={donorForm.city}
                    onChange={(e) => setDonorForm({ ...donorForm, city: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="dnr-address" className="block text-xs font-semibold text-[#202A44] mb-1">
                  Street Address
                </label>
                <input
                  id="dnr-address"
                  type="text"
                  value={donorForm.address}
                  onChange={(e) => setDonorForm({ ...donorForm, address: e.target.value })}
                  placeholder="48 Medical Grove, Apt 4B"
                  className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="dnr-last" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Last Donation Date (Optional)
                  </label>
                  <input
                    id="dnr-last"
                    type="date"
                    value={donorForm.lastDonationDate}
                    onChange={(e) => setDonorForm({ ...donorForm, lastDonationDate: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="dnr-bank" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Associated Blood Bank
                  </label>
                  <select
                    id="dnr-bank"
                    value={donorForm.associatedBankId}
                    disabled={user?.role === 'STAFF' && Boolean(user.bloodBankId)}
                    onChange={(e) => setDonorForm({ ...donorForm, associatedBankId: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm bg-white disabled:bg-[#F4F6FA]"
                  >
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2 rounded-lg border border-[#E8EBF2] text-xs font-semibold text-[#7B8499]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-[#E53945] hover:bg-[#cf2d38] text-xs font-semibold text-white"
                >
                  {submitting ? 'Registering...' : 'Register Donor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
