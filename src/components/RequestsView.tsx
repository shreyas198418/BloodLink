import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  GitCompareArrows,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { BLOOD_GROUPS } from '../lib/blood-compatibility.ts';
import { extractRequestContext } from '../lib/semantic-embedding.ts';
import { BloodRequestItem } from '../types/bloodlink.ts';
import {
  BloodGroupTag,
  PriorityBadge,
  RequestStatusLabel,
} from './StatusBadges.tsx';

export function RequestsView({
  initialOpenCreate = false,
  onConsumedOpenCreate,
  onOpenMatching,
}: {
  initialOpenCreate?: boolean;
  onConsumedOpenCreate?: () => void;
  onOpenMatching: (requestId: string) => void;
}) {
  const [requests, setRequests] = useState<BloodRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [searchText, setSearchText] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(initialOpenCreate);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const defaultDue = new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 16);
  const [reqForm, setReqForm] = useState({
    hospitalName: '',
    hospitalLocation: 'Central District',
    contactPerson: '',
    contactPhone: '',
    requiredBloodGroup: 'O-',
    unitsRequired: 2,
    priority: 'Emergency' as 'Emergency' | 'Urgent' | 'Routine',
    requestDescription: '',
    medicalUrgencyNotes: '',
    requiredByDate: defaultDue,
  });

  useEffect(() => {
    if (initialOpenCreate) {
      setShowCreateModal(true);
      onConsumedOpenCreate?.();
    }
  }, [initialOpenCreate, onConsumedOpenCreate]);

  const liveSemanticPreview = useMemo(() => {
    if (reqForm.requestDescription.trim().length < 6) return null;
    return extractRequestContext(reqForm.requestDescription);
  }, [reqForm.requestDescription]);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (priorityFilter !== 'ALL') params.set('priority', priorityFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (groupFilter !== 'ALL') params.set('bloodGroup', groupFilter);
      if (searchText.trim()) params.set('search', searchText.trim());

      const res = await apiFetch<{ requests: BloodRequestItem[] }>(
        `/api/requests?${params.toString()}`,
      );
      setRequests(res.requests);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load blood requests.');
    } finally {
      setLoading(false);
    }
  }, [priorityFilter, statusFilter, groupFilter, searchText]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ request: BloodRequestItem }>('/api/requests', {
        method: 'POST',
        body: JSON.stringify({
          ...reqForm,
          requiredByDate: new Date(reqForm.requiredByDate).toISOString(),
        }),
      });
      setShowCreateModal(false);
      setActionMsg(
        `Created ${res.request.requestCode} (${res.request.priority}, score ${res.request.priorityScore}) with pgvector embedding.`,
      );
      setReqForm({
        hospitalName: '',
        hospitalLocation: 'Central District',
        contactPerson: '',
        contactPhone: '',
        requiredBloodGroup: 'O-',
        unitsRequired: 2,
        priority: 'Emergency',
        requestDescription: '',
        medicalUrgencyNotes: '',
        requiredByDate: defaultDue,
      });
      await loadRequests();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create blood request.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePriorityChange(id: string, nextPriority: string) {
    try {
      await apiFetch(`/api/requests/${id}/priority`, {
        method: 'PATCH',
        body: JSON.stringify({ priority: nextPriority }),
      });
      setActionMsg(`Priority updated to ${nextPriority} with audit trail entry.`);
      await loadRequests();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update priority.');
    }
  }

  async function handleStatusChange(id: string, nextStatus: string) {
    try {
      await apiFetch(`/api/requests/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setActionMsg(`Request status updated to ${nextStatus}.`);
      await loadRequests();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#202A44]">
            Priority-Based Blood Requests
          </h1>
          <p className="text-sm text-[#7B8499]">
            Requests are automatically scored by clinical tier, deadline, shortage pressure, and indexed in pgvector.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setShowCreateModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#E53945] hover:bg-[#cf2d38] text-xs font-semibold text-white transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create Blood Request
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
                aria-label="Search blood requests"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search ID, hospital, or clinical notes..."
                className="h-9 pl-8 pr-3 rounded-lg border border-[#E8EBF2] text-xs w-60"
              />
            </div>

            <select
              aria-label="Filter by priority"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="h-9 px-3 rounded-lg border border-[#E8EBF2] text-xs font-medium bg-white"
            >
              <option value="ALL">All Priorities</option>
              <option value="Emergency">Emergency</option>
              <option value="Urgent">Urgent</option>
              <option value="Routine">Routine</option>
            </select>

            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 rounded-lg border border-[#E8EBF2] text-xs font-medium bg-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Processing">Processing</option>
              <option value="Matched">Matched</option>
              <option value="Partially Fulfilled">Partially Fulfilled</option>
              <option value="Fulfilled">Fulfilled</option>
              <option value="Cancelled">Cancelled</option>
            </select>

            <select
              aria-label="Filter by required blood group"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="h-9 px-3 rounded-lg border border-[#E8EBF2] text-xs font-medium bg-white"
            >
              <option value="ALL">All Groups</option>
              {BLOOD_GROUPS.map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-[#7B8499] tabular-nums">
            {requests.length} requests sorted by priority score
          </span>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-[#7B8499]">Loading blood requests...</div>
          ) : requests.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#7B8499]">No requests match these filters.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E8EBF2] bg-[#F4F6FA]/60 text-[11px] font-semibold text-[#7B8499]">
                  <th className="py-3 px-4">Request</th>
                  <th className="py-3 px-4">Hospital & Contact</th>
                  <th className="py-3 px-4">Group</th>
                  <th className="py-3 px-4 text-right">Units</th>
                  <th className="py-3 px-4">Priority & Score</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EBF2] text-sm">
                {requests.map((r) => {
                  const isExpanded = expandedId === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr className="hover:bg-[#F4F6FA]/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-mono-tabular text-xs font-bold text-[#101B3F]">
                            {r.requestCode}
                          </div>
                          <div className="text-xs text-[#7B8499] tabular-nums">
                            Due {new Date(r.requiredByDate).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="py-3 px-4 max-w-[260px]">
                          <div className="font-semibold text-[#202A44] truncate">
                            {r.hospitalName}
                          </div>
                          <div className="text-xs text-[#7B8499] truncate">
                            {r.hospitalLocation} · {r.contactPerson}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <BloodGroupTag group={r.requiredBloodGroup} />
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-xs font-bold">
                          {r.unitsFulfilled}/{r.unitsRequired}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <PriorityBadge priority={r.priority} />
                            <span className="font-mono-tabular text-xs font-semibold text-[#202A44]">
                              {r.priorityScore} pts
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <RequestStatusLabel status={r.status} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenMatching(r.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#101B3F] hover:bg-[#17264F] text-xs font-semibold text-white whitespace-nowrap"
                            >
                              <GitCompareArrows className="h-3.5 w-3.5" aria-hidden="true" />
                              Match
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : r.id)}
                              aria-expanded={isExpanded}
                              aria-label={`Details and audit trail for ${r.requestCode}`}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-[#E8EBF2] hover:border-[#101B3F] text-[#202A44]"
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" aria-hidden="true" />
                              ) : (
                                <ChevronDown className="h-4 w-4" aria-hidden="true" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-[#F4F6FA]/70">
                          <td colSpan={7} className="p-4">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                              <div className="lg:col-span-2 space-y-2">
                                <p className="text-xs font-semibold text-[#202A44]">
                                  Clinical Description & Extracted Context
                                </p>
                                <p className="text-sm text-[#202A44] leading-relaxed">
                                  {r.requestDescription}
                                </p>
                                {r.medicalUrgencyNotes && (
                                  <p className="text-xs text-[#7B8499]">
                                    Notes: {r.medicalUrgencyNotes}
                                  </p>
                                )}
                                {r.extractedContext?.medicalContext && (
                                  <p className="text-xs text-[#101B3F] font-medium">
                                    Context: {r.extractedContext.medicalContext.join(', ')} ·{' '}
                                    {r.extractedContext.timeSensitivity}
                                  </p>
                                )}
                              </div>

                              <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label
                                      htmlFor={`prio-${r.id}`}
                                      className="block text-[11px] font-semibold text-[#7B8499] mb-1"
                                    >
                                      Update Priority
                                    </label>
                                    <select
                                      id={`prio-${r.id}`}
                                      value={r.priority}
                                      onChange={(e) => handlePriorityChange(r.id, e.target.value)}
                                      className="w-full h-8 px-2 rounded-md border border-[#E8EBF2] bg-white text-xs font-medium"
                                    >
                                      <option value="Emergency">Emergency</option>
                                      <option value="Urgent">Urgent</option>
                                      <option value="Routine">Routine</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label
                                      htmlFor={`stat-${r.id}`}
                                      className="block text-[11px] font-semibold text-[#7B8499] mb-1"
                                    >
                                      Update Status
                                    </label>
                                    <select
                                      id={`stat-${r.id}`}
                                      value={r.status}
                                      onChange={(e) => handleStatusChange(r.id, e.target.value)}
                                      className="w-full h-8 px-2 rounded-md border border-[#E8EBF2] bg-white text-xs font-medium"
                                    >
                                      <option value="Pending">Pending</option>
                                      <option value="Processing">Processing</option>
                                      <option value="Matched">Matched</option>
                                      <option value="Partially Fulfilled">Partially Fulfilled</option>
                                      <option value="Fulfilled">Fulfilled</option>
                                      <option value="Rejected">Rejected</option>
                                      <option value="Cancelled">Cancelled</option>
                                    </select>
                                  </div>
                                </div>

                                <div>
                                  <p className="text-[11px] font-semibold text-[#7B8499] mb-1">
                                    Audit History ({r.history.length})
                                  </p>
                                  <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] text-[#7B8499]">
                                    {r.history.map((h) => (
                                      <div key={h.id} className="bg-white rounded px-2 py-1 border border-[#E8EBF2]">
                                        <span className="font-semibold text-[#202A44]">{h.newStatus}</span>
                                        {h.newPriority ? ` (${h.newPriority})` : ''} · {h.notes}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Blood Request Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-[#101B3F]/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-label="Create Blood Request"
            className="w-full max-w-xl rounded-2xl bg-white border border-[#E8EBF2] p-6 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <h2 className="font-display text-lg font-bold text-[#202A44]">
              Create Hospital Blood Request
            </h2>
            <p className="mt-1 text-xs text-[#7B8499]">
              Automatically computes explainable priority score and generates a 128-D pgvector embedding.
            </p>

            {formError && (
              <div role="alert" className="mt-3 rounded-lg bg-[#FDEBEC] px-3 py-2 text-xs font-medium text-[#E53945]">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="req-hosp" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Hospital Name
                  </label>
                  <input
                    id="req-hosp"
                    type="text"
                    value={reqForm.hospitalName}
                    onChange={(e) => setReqForm({ ...reqForm, hospitalName: e.target.value })}
                    placeholder="City General Medical Center"
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="req-loc" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Hospital Location
                  </label>
                  <input
                    id="req-loc"
                    type="text"
                    value={reqForm.hospitalLocation}
                    onChange={(e) => setReqForm({ ...reqForm, hospitalLocation: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="req-contact" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Attending Physician / Contact
                  </label>
                  <input
                    id="req-contact"
                    type="text"
                    value={reqForm.contactPerson}
                    onChange={(e) => setReqForm({ ...reqForm, contactPerson: e.target.value })}
                    placeholder="Dr. Priya Menon"
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="req-phone" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Contact Phone
                  </label>
                  <input
                    id="req-phone"
                    type="tel"
                    value={reqForm.contactPhone}
                    onChange={(e) => setReqForm({ ...reqForm, contactPhone: e.target.value })}
                    placeholder="+65 6555 1900"
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="req-group" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Blood Group
                  </label>
                  <select
                    id="req-group"
                    value={reqForm.requiredBloodGroup}
                    onChange={(e) => setReqForm({ ...reqForm, requiredBloodGroup: e.target.value })}
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
                  <label htmlFor="req-units" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Units Needed
                  </label>
                  <input
                    id="req-units"
                    type="number"
                    min={1}
                    value={reqForm.unitsRequired}
                    onChange={(e) => setReqForm({ ...reqForm, unitsRequired: Number(e.target.value) })}
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="req-priority" className="block text-xs font-semibold text-[#202A44] mb-1">
                    Priority Tier
                  </label>
                  <select
                    id="req-priority"
                    value={reqForm.priority}
                    onChange={(e) =>
                      setReqForm({
                        ...reqForm,
                        priority: e.target.value as 'Emergency' | 'Urgent' | 'Routine',
                      })
                    }
                    className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm bg-white"
                  >
                    <option value="Emergency">Emergency</option>
                    <option value="Urgent">Urgent</option>
                    <option value="Routine">Routine</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="req-due" className="block text-xs font-semibold text-[#202A44] mb-1">
                  Required By Date & Time
                </label>
                <input
                  id="req-due"
                  type="datetime-local"
                  value={reqForm.requiredByDate}
                  onChange={(e) => setReqForm({ ...reqForm, requiredByDate: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                />
              </div>

              <div>
                <label htmlFor="req-desc" className="block text-xs font-semibold text-[#202A44] mb-1">
                  Clinical Request Description (Used for Semantic Understanding)
                </label>
                <textarea
                  id="req-desc"
                  rows={3}
                  value={reqForm.requestDescription}
                  onChange={(e) => setReqForm({ ...reqForm, requestDescription: e.target.value })}
                  placeholder="Example: A patient needs two units of O negative blood immediately after a serious traffic accident."
                  className="w-full p-3 rounded-lg border border-[#E8EBF2] text-sm"
                />
              </div>

              {liveSemanticPreview && (
                <div className="rounded-lg bg-[#F4F6FA] border border-[#E8EBF2] p-3 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-[#101B3F]">
                    <Sparkles className="h-3.5 w-3.5 text-[#E53945]" aria-hidden="true" />
                    Semantic Context Extraction Preview
                  </div>
                  <p className="text-[#202A44]">
                    Suggested Priority: <strong>{liveSemanticPreview.suggestedPriority}</strong> ·
                    Time Sensitivity: {liveSemanticPreview.timeSensitivity}
                    {liveSemanticPreview.detectedBloodGroup
                      ? ` · Detected Group: ${liveSemanticPreview.detectedBloodGroup}`
                      : ''}
                    {liveSemanticPreview.detectedUnits
                      ? ` · Units: ${liveSemanticPreview.detectedUnits}`
                      : ''}
                  </p>
                  <p className="text-[#7B8499]">
                    Context: {liveSemanticPreview.medicalContext.join(', ')}
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="req-notes" className="block text-xs font-semibold text-[#202A44] mb-1">
                  Medical Urgency Notes (Optional)
                </label>
                <input
                  id="req-notes"
                  type="text"
                  value={reqForm.medicalUrgencyNotes}
                  onChange={(e) => setReqForm({ ...reqForm, medicalUrgencyNotes: e.target.value })}
                  placeholder="Ward / Operating Theatre details"
                  className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg border border-[#E8EBF2] text-xs font-semibold text-[#7B8499]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-[#E53945] hover:bg-[#cf2d38] text-xs font-semibold text-white"
                >
                  {submitting ? 'Creating...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
