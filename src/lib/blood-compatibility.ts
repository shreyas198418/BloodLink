export const BLOOD_GROUPS = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
] as const;

export type BloodGroup = (typeof BLOOD_GROUPS)[number];
export type RhFactor = 'Positive' | 'Negative';

/**
 * Red Blood Cell (RBC) Compatibility Matrix:
 * Maps each RECIPIENT blood group to the list of DONOR blood groups
 * they can safely receive packed red blood cells from.
 */
export const RBC_RECIPIENT_COMPATIBILITY: Record<BloodGroup, readonly BloodGroup[]> = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
};

export function isValidBloodGroup(value: string): value is BloodGroup {
  return (BLOOD_GROUPS as readonly string[]).includes(value);
}

export function parseRhFactor(bloodGroup: BloodGroup): RhFactor {
  return bloodGroup.endsWith('+') ? 'Positive' : 'Negative';
}

export function canDonorDonateToRecipient(
  donorGroup: BloodGroup,
  recipientGroup: BloodGroup,
): boolean {
  return RBC_RECIPIENT_COMPATIBILITY[recipientGroup].includes(donorGroup);
}

export function getCompatibleDonorGroups(recipientGroup: BloodGroup): BloodGroup[] {
  return [...RBC_RECIPIENT_COMPATIBILITY[recipientGroup]];
}

export function calculateDonorAge(
  dateOfBirth: string,
  referenceDate: Date = new Date(),
): number {
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return -1;
  let age = referenceDate.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = referenceDate.getUTCMonth() - dob.getUTCMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && referenceDate.getUTCDate() < dob.getUTCDate())
  ) {
    age--;
  }
  return age;
}

export interface EligibilityPolicy {
  minDonationIntervalDays: number;
  minDonorAge: number;
  maxDonorAge: number;
}

export const DEFAULT_ELIGIBILITY_POLICY: EligibilityPolicy = {
  minDonationIntervalDays: 56,
  minDonorAge: 18,
  maxDonorAge: 65,
};

export interface DonorScreeningResult {
  eligible: boolean;
  reasons: string[];
  daysSinceLastDonation: number | null;
  age: number;
}

/**
 * Configurable donor screening rule check (not a substitute for clinical medical clearance).
 */
export function evaluateDonorScreeningEligibility(
  donor: {
    dateOfBirth: string;
    lastDonationDate: string | null;
    availabilityStatus: string;
    isActive?: boolean;
  },
  policy: EligibilityPolicy = DEFAULT_ELIGIBILITY_POLICY,
  referenceDate: Date = new Date(),
): DonorScreeningResult {
  const reasons: string[] = [];
  const age = calculateDonorAge(donor.dateOfBirth, referenceDate);

  if (donor.isActive === false) {
    reasons.push('Donor profile is deactivated');
  }

  if (donor.availabilityStatus !== 'Available') {
    reasons.push(`Availability status is ${donor.availabilityStatus}`);
  }

  if (age < policy.minDonorAge || age > policy.maxDonorAge) {
    reasons.push(
      `Age (${age}) outside screening policy range (${policy.minDonorAge}-${policy.maxDonorAge} yrs)`,
    );
  }

  let daysSinceLastDonation: number | null = null;
  if (donor.lastDonationDate) {
    const lastDate = new Date(`${donor.lastDonationDate}T00:00:00Z`);
    if (!Number.isNaN(lastDate.getTime())) {
      const diffMs = referenceDate.getTime() - lastDate.getTime();
      daysSinceLastDonation = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (daysSinceLastDonation < policy.minDonationIntervalDays) {
        const remaining = policy.minDonationIntervalDays - daysSinceLastDonation;
        reasons.push(
          `Last donated ${daysSinceLastDonation} days ago; screening rule requires ${policy.minDonationIntervalDays} days (${remaining} days remaining)`,
        );
      }
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    daysSinceLastDonation,
    age,
  };
}

export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  if (
    (lat1 === 0 && lon1 === 0) ||
    (lat2 === 0 && lon2 === 0)
  ) {
    return 0;
  }
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}
