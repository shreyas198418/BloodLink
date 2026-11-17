import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { BloodRequestItem } from '../types/bloodlink.ts';
import {
  BloodGroupTag,
  PriorityBadge,
  RequestStatusLabel,
} from './StatusBadges.tsx';

interface MatchingResponse {
  request: BloodRequestItem;
  priorityDetails: {
    score: number;
    explanation: string;
    breakdown: {
      baseWeight: number;
      timeUrgencyBonus: number;
      shortageBonus: number;
      ageBonus: number;
      volumeBonus: number;
    };
  };
  screeningPolicy: {
    minDonationIntervalDays: number;
    minDonorAge: number;
    maxDonorAge: number;
  };
  compatibleGroups: string[];
  compatibleDonors: Array<{
    donorId: string;
    donorCode: string;
    fullName: string;
    bloodGroup: string;
    city: string;
    phoneNumber?: string;
    matchScore: number;
    distanceKm: number;
    explanation: string;
  }>;
  ineligibleDonors: Array<{
    donorId: string;
    donorCode: string;
    fullName: string;
    bloodGroup: string;
    city: string;
    explanation: string;
    exclusionReasons: string[];
  }>;
  compatibleBanks: Array<{
    inventoryId: string;
    bloodBankId: string;
    bankName: string;
    bankCity: string;
    bloodGroup: string;
    unitsAvailable: number;
    expiryDate: string;
    matchScore: number;
    distanceKm: number;
    explanation: string;
  }>;
  excludedBanks: Array<{
    inventoryId: string;
    bankName: string;
    bloodGroup: string;
    unitsAvailable: number;
    expiryDate: string;
    isExpired: boolean;
    explanation: string;
  }>;
  similarRequests: Array<{
    id: string;
    requestCode: string;
    hospitalName: string;
    requiredBloodGroup: string;
    unitsRequired: number;
    priority: string;
    status: string;
    requestDescription: string;
    similarity: number;
    explanation: string;
  }>;
}

interface SemanticSearchResult {
  query: string;
  extractedContext: {
    urgencyIndicators: string[];
    suggestedPriority: string;
    detectedBloodGroup: string | null;
    detectedUnits: number | null;
    medicalContext: string[];
    timeSensitivity: string;
  };
  matches: Array<{
    id: string;
    requestCode: string;
    hospitalName: string;
    requiredBloodGroup: string;
    unitsRequired: number;
    priority: string;
    status: string;
    requestDescription: string;
    similarity: number;
    explanation: string;
  }>;
  safetyNotice: string;
}

export function MatchingView({
  initialRequestId,
}: {
  initialRequestId?: string | null;
}) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<BloodRequestItem[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string>(initialRequestId || '');
  const [matchData, setMatchData] = useState<MatchingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);

  // Semantic pgvector search
  const [semanticQuery, setSemanticQuery] = useState('');
  const [semanticResult, setSemanticResult] = useState<SemanticSearchResult | null>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);

  // Atomic allocation modal
  const [allocBank, setAllocBank] = useState<MatchingResponse['compatibleBanks'][number] | null>(null);
  const [allocUnits, setAllocUnits] = useState<number>(1);
  const [allocating, setAllocating] = useState(false);
  const [allocError, setAllocError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRequestId) {
      setSelectedRequestId(initialRequestId);
    }
  }, [initialRequestId]);

  const loadRequestsAndMatches = useCallback(async (reqIdOverride?: string) => {
    setLoading(true);
    setError(null);
    try {
      const reqRes = await apiFetch<{ requests: BloodRequestItem[] }>('/api/requests');
      setRequests(reqRes.requests);

      const targetId =
        reqIdOverride ||
        selectedRequestId ||
        reqRes.requests.find((r) => !['Fulfilled', 'Cancelled', 'Rejected'].includes(r.status))?.id ||
        reqRes.requests[0]?.id;

      if (targetId) {
        setSelectedRequestId(targetId);
        const mRes = await apiFetch<MatchingResponse>(`/api/matching/${targetId}`);
        setMatchData(mRes);
      } else {
        setMatchData(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load matching engine.');
    } finally {
      setLoading(false);
    }
  }, [selectedRequestId]);

  useEffect(() => {
    loadRequestsAndMatches();
  }, [loadRequestsAndMatches]);

  async function handleSelectRequest(id: string) {
    setSelectedRequestId(id);
    setActionMsg(null);
    await loadRequestsAndMatches(id);
  }

  async function handleSemanticSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!semanticQuery.trim()) return;
    setSemanticLoading(true);
    setError(null);
    try {
      const res = await apiFetch<SemanticSearchResult>('/api/semantic-search', {
        method: 'POST',
        body: JSON.stringify({ query: semanticQuery.trim() }),
      });
      setSemanticResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Semantic search failed.');
    } finally {
      setSemanticLoading(false);
    }
  }

  async function handleAllocateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allocBank || !matchData) return;
    setAllocError(null);
    setAllocating(true);
    try {
      const res = await apiFetch<{ message: string; request: BloodRequestItem }>(
        `/api/matching/${matchData.request.id}/allocate`,
        {
          method: 'POST',
          body: JSON.stringify({
            inventoryId: allocBank.inventoryId,
            unitsToAllocate: allocUnits,
          }),
        },
      );
      setAllocBank(null);
      setActionMsg(
        `${res.message} ${matchData.request.requestCode} is now ${res.request.status} (${res.request.unitsFulfilled}/${res.request.unitsRequired} units).`,
      );
      await loadRequestsAndMatches(matchData.request.id);
    } catch (err: unknown) {
      setAllocError(err instanceof Error ? err.message : 'Allocation failed.');
    } finally {
      setAllocating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#202A44]">
            Smart Donor Matching & Semantic Request Understanding
          </h1>
          <p className="text-sm text-[#7B8499]">
            RBC compatibility matrix, 56-day screening rule, atomic PostgreSQL allocation, and pgvector cosine similarity.
          </p>
        </div>

        <div className="w-full lg:w-80">
          <label htmlFor="match-req-select" className="block text-[11px] font-semibold text-[#7B8499] mb-1">
            Select Blood Request
          </label>
          <select
            id="match-req-select"
            value={selectedRequestId}
            onChange={(e) => handleSelectRequest(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] bg-white text-xs font-semibold text-[#202A44]"
          >
            {requests.map((r) => (
              <option key={r.id} value={r.id}>
                {r.requestCode} · {r.requiredBloodGroup} ({r.priority}) — {r.hospitalName} [{r.status}]
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Clinical Safety Disclaimer */}
      <div className="rounded-xl bg-[#EEF1F7] border border-[#101B3F]/15 p-4 flex items-start gap-3 text-xs text-[#202A44]">
        <ShieldCheck className="h-4.5 w-4.5 text-[#101B3F] shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <strong className="font-semibold">Screening Policy & Clinical Governance:</strong>{' '}
          Donor eligibility checks apply configurable screening rules only (minimum donation interval, age range, availability), not medical clearance. Semantic similarity assists request triage and never overrides ABO/Rh compatibility, expiry exclusion, or blood-bank personnel confirmation.
        </div>
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

      {/* pgvector Semantic Request Search Bar */}
      <div className="rounded-xl bg-white border border-[#E8EBF2] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-[#E53945]" aria-hidden="true" />
          <h2 className="font-display text-base font-bold text-[#202A44]">
            Semantic Request Search (pgvector Cosine Similarity)
          </h2>
        </div>
        <form onSubmit={handleSemanticSearch} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-[#7B8499] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="text"
              aria-label="Describe clinical blood request for semantic search"
              value={semanticQuery}
              onChange={(e) => setSemanticQuery(e.target.value)}
              placeholder="e.g. A patient needs two units of O negative blood immediately after a serious highway accident..."
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-[#E8EBF2] text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={semanticLoading}
            className="h-10 px-4 rounded-lg bg-[#101B3F] hover:bg-[#17264F] text-xs font-semibold text-white whitespace-nowrap"
          >
            {semanticLoading ? 'Searching pgvector...' : 'Search Similar Requests'}
          </button>
        </form>

        {semanticResult && (
          <div className="mt-4 pt-4 border-t border-[#E8EBF2] space-y-3">
            <div className="rounded-lg bg-[#F4F6FA] p-3 text-xs space-y-1">
              <p className="font-semibold text-[#101B3F]">
                Extracted Clinical Context: {semanticResult.extractedContext.medicalContext.join(', ')}
              </p>
              <p className="text-[#202A44]">
                Inferred Priority: <strong>{semanticResult.extractedContext.suggestedPriority}</strong> ·
                Time Sensitivity: {semanticResult.extractedContext.timeSensitivity}
                {semanticResult.extractedContext.detectedBloodGroup
                  ? ` · Blood Group: ${semanticResult.extractedContext.detectedBloodGroup}`
                  : ''}
                {semanticResult.extractedContext.detectedUnits
                  ? ` · Units: ${semanticResult.extractedContext.detectedUnits}`
                  : ''}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {semanticResult.matches.map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-[#E8EBF2] p-3 flex flex-col justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular text-xs font-bold text-[#101B3F]">
                        {m.requestCode} · {m.hospitalName}
                      </span>
                      <span className="font-mono-tabular text-xs font-bold text-[#27AE75]">
                        {(m.similarity * 100).toFixed(1)}% match
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#202A44]">{m.requestDescription}</p>
                    <p className="mt-1 text-[11px] text-[#7B8499]">{m.explanation}</p>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5">
                      <BloodGroupTag group={m.requiredBloodGroup} />
                      <PriorityBadge priority={m.priority} />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectRequest(m.id)}
                      className="text-xs font-semibold text-[#E53945] hover:underline"
                    >
                      Inspect Matches
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading || !matchData ? (
        <div className="rounded-xl bg-white border border-[#E8EBF2] p-8 text-center text-sm text-[#7B8499]">
          Computing donor compatibility & multi-bank matching scores...
        </div>
      ) : (
        <div className="space-y-6">
          {/* Selected Request Overview */}
          <div className="rounded-xl bg-white border border-[#E8EBF2] p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-mono-tabular text-sm font-bold text-[#101B3F]">
                    {matchData.request.requestCode}
                  </span>
                  <BloodGroupTag group={matchData.request.requiredBloodGroup} />
                  <PriorityBadge priority={matchData.request.priority} />
                  <RequestStatusLabel status={matchData.request.status} />
                </div>
                <h2 className="mt-2 font-display text-lg font-bold text-[#202A44]">
                  {matchData.request.hospitalName} — {matchData.request.hospitalLocation}
                </h2>
                <p className="mt-1 text-sm text-[#202A44]">
                  {matchData.request.requestDescription}
                </p>
              </div>

              <div className="rounded-lg bg-[#F4F6FA] px-4 py-3 text-right shrink-0">
                <p className="text-[11px] font-semibold text-[#7B8499]">Fulfillment & Score</p>
                <p className="font-display text-xl font-bold text-[#202A44] tabular-nums">
                  {matchData.request.unitsFulfilled} / {matchData.request.unitsRequired} units
                </p>
                <p className="text-xs font-mono-tabular text-[#E53945] font-semibold">
                  Priority Score: {matchData.priorityDetails.score}
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#E8EBF2] flex flex-wrap items-center justify-between gap-2 text-xs text-[#7B8499]">
              <span>
                Compatible RBC Donor Groups:{' '}
                <strong className="text-[#202A44]">{matchData.compatibleGroups.join(', ')}</strong>
              </span>
              <span>Score Breakdown: {matchData.priorityDetails.explanation}</span>
            </div>
          </div>

          {/* Compatible Blood Banks (With Atomic Allocation) */}
          <div className="rounded-xl bg-white border border-[#E8EBF2] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E8EBF2] flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-[#202A44]">
                  Compatible Blood Bank Stock ({matchData.compatibleBanks.length})
                </h3>
                <p className="text-xs text-[#7B8499]">
                  Non-expired, compatible inventory batches ranked by match score and proximity
                </p>
              </div>
              <Database className="h-4 w-4 text-[#7B8499]" aria-hidden="true" />
            </div>

            {matchData.compatibleBanks.length === 0 ? (
              <div className="p-6 text-sm text-[#E53945] font-medium">
                No valid compatible inventory batches currently available across network banks.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E8EBF2] bg-[#F4F6FA]/60 text-[11px] font-semibold text-[#7B8499]">
                      <th className="py-3 px-4">Blood Bank</th>
                      <th className="py-3 px-4">Batch Group</th>
                      <th className="py-3 px-4 text-right">Available</th>
                      <th className="py-3 px-4 text-right">Distance</th>
                      <th className="py-3 px-4 text-right">Match Score</th>
                      <th className="py-3 px-4">Explanation</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8EBF2] text-sm">
                    {matchData.compatibleBanks.map((b) => {
                      const canAllocate =
                        !['Fulfilled', 'Cancelled', 'Rejected'].includes(matchData.request.status) &&
                        (user?.role === 'ADMIN' || user?.bloodBankId === b.bloodBankId);

                      return (
                        <tr key={b.inventoryId} className="hover:bg-[#F4F6FA]/50">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-[#202A44]">{b.bankName}</div>
                            <div className="text-xs text-[#7B8499]">
                              {b.bankCity} · Expires {b.expiryDate}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <BloodGroupTag group={b.bloodGroup} />
                          </td>
                          <td className="py-3 px-4 text-right font-mono-tabular font-bold text-[#27AE75]">
                            {b.unitsAvailable} units
                          </td>
                          <td className="py-3 px-4 text-right font-mono-tabular text-xs text-[#7B8499]">
                            {b.distanceKm} km
                          </td>
                          <td className="py-3 px-4 text-right font-mono-tabular font-bold text-[#101B3F]">
                            {b.matchScore}
                          </td>
                          <td className="py-3 px-4 text-xs text-[#7B8499] max-w-[260px]">
                            {b.explanation}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {canAllocate ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const needed = Math.max(
                                    1,
                                    matchData.request.unitsRequired - matchData.request.unitsFulfilled,
                                  );
                                  setAllocError(null);
                                  setAllocBank(b);
                                  setAllocUnits(Math.min(needed, b.unitsAvailable));
                                }}
                                className="px-3 py-1.5 rounded-lg bg-[#E53945] hover:bg-[#cf2d38] text-xs font-semibold text-white whitespace-nowrap"
                              >
                                Allocate Units
                              </button>
                            ) : (
                              <span className="text-xs text-[#7B8499]">
                                {['Fulfilled', 'Cancelled'].includes(matchData.request.status)
                                  ? matchData.request.status
                                  : 'Other Bank'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Compatible Donors & Semantically Similar Requests */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 rounded-xl bg-white border border-[#E8EBF2] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E8EBF2] flex items-center justify-between">
                <div>
                  <h3 className="font-display text-base font-bold text-[#202A44]">
                    Compatible Eligible Donors ({matchData.compatibleDonors.length})
                  </h3>
                  <p className="text-xs text-[#7B8499]">
                    Passed ABO/Rh check & {matchData.screeningPolicy.minDonationIntervalDays}-day screening rule
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExcluded((v) => !v)}
                  className="text-xs font-semibold text-[#101B3F] hover:underline"
                >
                  {showExcluded ? 'Hide Excluded' : `Show Excluded (${matchData.ineligibleDonors.length + matchData.excludedBanks.length})`}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E8EBF2] bg-[#F4F6FA]/60 text-[11px] font-semibold text-[#7B8499]">
                      <th className="py-3 px-4">Donor</th>
                      <th className="py-3 px-4">Group</th>
                      <th className="py-3 px-4 text-right">Distance</th>
                      <th className="py-3 px-4 text-right">Score</th>
                      <th className="py-3 px-4">Match Explanation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8EBF2] text-sm">
                    {matchData.compatibleDonors.map((d) => (
                      <tr key={d.donorId} className="hover:bg-[#F4F6FA]/50">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#202A44]">{d.fullName}</div>
                          <div className="font-mono-tabular text-xs text-[#7B8499]">
                            {d.donorCode} · {d.city}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <BloodGroupTag group={d.bloodGroup} />
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-xs text-[#7B8499]">
                          {d.distanceKm} km
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular font-bold text-[#27AE75]">
                          {d.matchScore}
                        </td>
                        <td className="py-3 px-4 text-xs text-[#7B8499]">{d.explanation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {showExcluded && (
                <div className="p-4 border-t border-[#E8EBF2] bg-[#F4F6FA]/60 space-y-3">
                  <p className="text-xs font-semibold text-[#202A44] flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-[#F39C38]" aria-hidden="true" />
                    Excluded Inventory Batches & Ineligible Donors (Safety Audit)
                  </p>
                  <div className="space-y-1.5 text-xs">
                    {matchData.excludedBanks.slice(0, 5).map((eb) => (
                      <div key={eb.inventoryId} className="bg-white rounded-md border border-[#E8EBF2] px-3 py-2 flex justify-between gap-3">
                        <span className="font-semibold text-[#202A44]">
                          {eb.bankName} ({eb.bloodGroup})
                        </span>
                        <span className="text-[#E53945]">{eb.explanation}</span>
                      </div>
                    ))}
                    {matchData.ineligibleDonors.slice(0, 5).map((idnr) => (
                      <div key={idnr.donorId} className="bg-white rounded-md border border-[#E8EBF2] px-3 py-2 flex justify-between gap-3">
                        <span className="font-semibold text-[#202A44]">
                          {idnr.fullName} ({idnr.bloodGroup})
                        </span>
                        <span className="text-[#7B8499]">{idnr.explanation}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-white border border-[#E8EBF2] p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#E53945]" aria-hidden="true" />
                <h3 className="font-display text-base font-bold text-[#202A44]">
                  Related Requests (pgvector)
                </h3>
              </div>
              <p className="text-xs text-[#7B8499]">
                Retrieved via cosine similarity on 128-D embeddings stored in <code className="font-mono-tabular">request_embeddings</code>.
              </p>

              <div className="space-y-2.5">
                {matchData.similarRequests.map((sr) => (
                  <div
                    key={sr.id}
                    className="rounded-lg border border-[#E8EBF2] p-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular text-xs font-bold text-[#101B3F]">
                        {sr.requestCode}
                      </span>
                      <span className="font-mono-tabular text-xs font-bold text-[#27AE75]">
                        {(sr.similarity * 100).toFixed(1)}% similar
                      </span>
                    </div>
                    <p className="text-xs font-medium text-[#202A44]">{sr.hospitalName}</p>
                    <p className="text-xs text-[#7B8499] line-clamp-2">{sr.requestDescription}</p>
                    <p className="text-[11px] text-[#101B3F]">{sr.explanation}</p>
                    <div className="flex items-center justify-between pt-1">
                      <BloodGroupTag group={sr.requiredBloodGroup} />
                      <button
                        type="button"
                        onClick={() => handleSelectRequest(sr.id)}
                        className="text-xs font-semibold text-[#E53945] hover:underline"
                      >
                        Switch to Request
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Atomic Allocation Confirmation Modal */}
      {allocBank && matchData && (
        <div className="fixed inset-0 z-50 bg-[#101B3F]/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-label="Confirm Atomic Blood Allocation"
            className="w-full max-w-md rounded-2xl bg-white border border-[#E8EBF2] p-6 shadow-xl"
          >
            <div className="flex items-center gap-2 text-[#101B3F]">
              <CheckCircle2 className="h-5 w-5 text-[#27AE75]" aria-hidden="true" />
              <h2 className="font-display text-lg font-bold text-[#202A44]">
                Confirm Atomic Blood Allocation
              </h2>
            </div>
            <p className="mt-2 text-xs text-[#7B8499] leading-relaxed">
              Allocating from <strong>{allocBank.bankName}</strong> ({allocBank.bloodGroup}, {allocBank.unitsAvailable} valid units) to <strong>{matchData.request.requestCode}</strong> ({matchData.request.hospitalName}). Executed inside a PostgreSQL ACID transaction.
            </p>

            {allocError && (
              <div role="alert" className="mt-3 rounded-lg bg-[#FDEBEC] px-3 py-2 text-xs font-medium text-[#E53945]">
                {allocError}
              </div>
            )}

            <form onSubmit={handleAllocateSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="alloc-units" className="block text-xs font-semibold text-[#202A44] mb-1">
                  Units to Allocate (Max {allocBank.unitsAvailable})
                </label>
                <input
                  id="alloc-units"
                  type="number"
                  min={1}
                  max={allocBank.unitsAvailable}
                  value={allocUnits}
                  onChange={(e) => setAllocUnits(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-[#E8EBF2] text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAllocBank(null)}
                  className="px-4 py-2 rounded-lg border border-[#E8EBF2] text-xs font-semibold text-[#7B8499]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={allocating}
                  className="px-4 py-2 rounded-lg bg-[#E53945] hover:bg-[#cf2d38] text-xs font-semibold text-white"
                >
                  {allocating ? 'Executing Transaction...' : 'Confirm & Allocate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
