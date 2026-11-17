import {
  type BloodGroup,
  calculateDistanceKm,
  canDonorDonateToRecipient,
  DEFAULT_ELIGIBILITY_POLICY,
  type EligibilityPolicy,
  evaluateDonorScreeningEligibility,
  isValidBloodGroup,
} from './blood-compatibility.ts';

export interface MatchableRequest {
  id: string;
  requiredBloodGroup: string;
  unitsRequired: number;
  unitsFulfilled: number;
  priority: string;
  latitude: number;
  longitude: number;
  hospitalLocation: string;
}

export interface MatchableDonor {
  id: string;
  donorCode: string;
  fullName: string;
  dateOfBirth: string;
  bloodGroup: string;
  city: string;
  latitude: number;
  longitude: number;
  lastDonationDate: string | null;
  availabilityStatus: string;
  associatedBankId: string | null;
  isActive: boolean;
}

export interface MatchableInventoryBatch {
  id: string;
  bloodBankId: string;
  bankName: string;
  bankCity: string;
  bankLatitude: number;
  bankLongitude: number;
  operatingStatus: string;
  bloodGroup: string;
  unitsAvailable: number;
  minimumThreshold: number;
  expiryDate: string;
}

export interface RankedDonorMatch {
  donorId: string;
  donorCode: string;
  fullName: string;
  bloodGroup: string;
  city: string;
  compatible: boolean;
  eligible: boolean;
  matchScore: number;
  distanceKm: number;
  explanation: string;
  exclusionReasons: string[];
}

export interface RankedBankMatch {
  inventoryId: string;
  bloodBankId: string;
  bankName: string;
  bankCity: string;
  bloodGroup: string;
  unitsAvailable: number;
  expiryDate: string;
  compatible: boolean;
  isExpired: boolean;
  matchScore: number;
  distanceKm: number;
  explanation: string;
  exclusionReasons: string[];
}

export function isBatchExpired(
  expiryDate: string,
  referenceDate: Date = new Date(),
): boolean {
  const todayIso = referenceDate.toISOString().slice(0, 10);
  return expiryDate < todayIso;
}

export function matchDonorsAndInventory(
  request: MatchableRequest,
  donorsList: MatchableDonor[],
  inventoryList: MatchableInventoryBatch[],
  policy: EligibilityPolicy = DEFAULT_ELIGIBILITY_POLICY,
  referenceDate: Date = new Date(),
): {
  compatibleDonors: RankedDonorMatch[];
  ineligibleDonors: RankedDonorMatch[];
  compatibleBanks: RankedBankMatch[];
  excludedBanks: RankedBankMatch[];
} {
  if (!isValidBloodGroup(request.requiredBloodGroup)) {
    throw new Error(`Invalid required blood group: ${request.requiredBloodGroup}`);
  }
  const targetGroup: BloodGroup = request.requiredBloodGroup;
  const priorityBonus =
    request.priority === 'Emergency' ? 15 : request.priority === 'Urgent' ? 8 : 0;

  const compatibleDonors: RankedDonorMatch[] = [];
  const ineligibleDonors: RankedDonorMatch[] = [];

  for (const donor of donorsList) {
    const donorGroup = isValidBloodGroup(donor.bloodGroup)
      ? donor.bloodGroup
      : null;
    const compatible = donorGroup
      ? canDonorDonateToRecipient(donorGroup, targetGroup)
      : false;
    const screening = evaluateDonorScreeningEligibility(
      donor,
      policy,
      referenceDate,
    );
    const distanceKm = calculateDistanceKm(
      request.latitude,
      request.longitude,
      donor.latitude,
      donor.longitude,
    );

    const exclusionReasons: string[] = [];
    if (!compatible) {
      exclusionReasons.push(
        `Blood group ${donor.bloodGroup} is not RBC-compatible with ${targetGroup}`,
      );
    }
    exclusionReasons.push(...screening.reasons);

    if (compatible && screening.eligible) {
      const exactBonus = donor.bloodGroup === targetGroup ? 25 : 14;
      const proximityScore = Math.max(0, 35 - distanceKm * 0.45);
      const readinessBonus =
        screening.daysSinceLastDonation === null
          ? 20
          : Math.min(20, Math.round(screening.daysSinceLastDonation / 10));
      const matchScore =
        Math.round(
          Math.min(100, exactBonus + proximityScore + readinessBonus + priorityBonus) *
            10,
        ) / 10;

      const matchKind =
        donor.bloodGroup === targetGroup
          ? `Exact ${donor.bloodGroup} match`
          : `Compatible ${donor.bloodGroup} → ${targetGroup} RBC donor`;
      const donationNote =
        screening.daysSinceLastDonation === null
          ? 'No prior donation recorded (screening clear)'
          : `Last donated ${screening.daysSinceLastDonation}d ago (≥${policy.minDonationIntervalDays}d rule)`;

      compatibleDonors.push({
        donorId: donor.id,
        donorCode: donor.donorCode,
        fullName: donor.fullName,
        bloodGroup: donor.bloodGroup,
        city: donor.city,
        compatible: true,
        eligible: true,
        matchScore,
        distanceKm,
        explanation: `${matchKind} · ${donationNote} · ${distanceKm} km from hospital`,
        exclusionReasons: [],
      });
    } else {
      ineligibleDonors.push({
        donorId: donor.id,
        donorCode: donor.donorCode,
        fullName: donor.fullName,
        bloodGroup: donor.bloodGroup,
        city: donor.city,
        compatible,
        eligible: false,
        matchScore: 0,
        distanceKm,
        explanation: exclusionReasons.join(' · '),
        exclusionReasons,
      });
    }
  }

  compatibleDonors.sort((a, b) => b.matchScore - a.matchScore || a.distanceKm - b.distanceKm);

  const compatibleBanks: RankedBankMatch[] = [];
  const excludedBanks: RankedBankMatch[] = [];
  const remainingNeeded = Math.max(1, request.unitsRequired - request.unitsFulfilled);

  for (const batch of inventoryList) {
    const batchGroup = isValidBloodGroup(batch.bloodGroup)
      ? batch.bloodGroup
      : null;
    const compatible = batchGroup
      ? canDonorDonateToRecipient(batchGroup, targetGroup)
      : false;
    const expired = isBatchExpired(batch.expiryDate, referenceDate);
    const distanceKm = calculateDistanceKm(
      request.latitude,
      request.longitude,
      batch.bankLatitude,
      batch.bankLongitude,
    );

    const exclusionReasons: string[] = [];
    if (!compatible) {
      exclusionReasons.push(
        `Group ${batch.bloodGroup} incompatible with ${targetGroup}`,
      );
    }
    if (expired) {
      exclusionReasons.push(`Batch expired on ${batch.expiryDate}`);
    }
    if (batch.unitsAvailable <= 0) {
      exclusionReasons.push('Depleted (0 units available)');
    }
    if (batch.operatingStatus === 'Closed') {
      exclusionReasons.push('Blood bank is currently Closed');
    }

    if (compatible && !expired && batch.unitsAvailable > 0 && batch.operatingStatus !== 'Closed') {
      const exactBonus = batch.bloodGroup === targetGroup ? 30 : 18;
      const fulfillmentCoverage = Math.min(
        25,
        Math.round((batch.unitsAvailable / remainingNeeded) * 25),
      );
      const proximityScore = Math.max(0, 30 - distanceKm * 0.4);
      const matchScore =
        Math.round(
          Math.min(100, exactBonus + fulfillmentCoverage + proximityScore + priorityBonus) *
            10,
        ) / 10;

      const matchKind =
        batch.bloodGroup === targetGroup
          ? `Exact ${batch.bloodGroup} stock`
          : `Compatible ${batch.bloodGroup} → ${targetGroup} stock`;

      compatibleBanks.push({
        inventoryId: batch.id,
        bloodBankId: batch.bloodBankId,
        bankName: batch.bankName,
        bankCity: batch.bankCity,
        bloodGroup: batch.bloodGroup,
        unitsAvailable: batch.unitsAvailable,
        expiryDate: batch.expiryDate,
        compatible: true,
        isExpired: false,
        matchScore,
        distanceKm,
        explanation: `${matchKind} · ${batch.unitsAvailable} units valid until ${batch.expiryDate} · ${distanceKm} km away`,
        exclusionReasons: [],
      });
    } else {
      excludedBanks.push({
        inventoryId: batch.id,
        bloodBankId: batch.bloodBankId,
        bankName: batch.bankName,
        bankCity: batch.bankCity,
        bloodGroup: batch.bloodGroup,
        unitsAvailable: batch.unitsAvailable,
        expiryDate: batch.expiryDate,
        compatible,
        isExpired: expired,
        matchScore: 0,
        distanceKm,
        explanation: exclusionReasons.join(' · '),
        exclusionReasons,
      });
    }
  }

  compatibleBanks.sort((a, b) => b.matchScore - a.matchScore || a.distanceKm - b.distanceKm);

  return {
    compatibleDonors,
    ineligibleDonors,
    compatibleBanks,
    excludedBanks,
  };
}
