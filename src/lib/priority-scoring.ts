export type RequestPriority = 'Emergency' | 'Urgent' | 'Routine';

export interface PriorityWeights {
  emergencyWeight: number;
  urgentWeight: number;
  routineWeight: number;
}

export const DEFAULT_PRIORITY_WEIGHTS: PriorityWeights = {
  emergencyWeight: 100,
  urgentWeight: 60,
  routineWeight: 20,
};

export interface PriorityScoreInput {
  priority: RequestPriority;
  requiredByDate: string;
  requestDate?: Date | string;
  unitsRequired: number;
  availableCompatibleUnits: number;
}

export interface PriorityScoreBreakdown {
  baseWeight: number;
  timeUrgencyBonus: number;
  shortageBonus: number;
  ageBonus: number;
  volumeBonus: number;
}

export interface PriorityScoreResult {
  score: number;
  breakdown: PriorityScoreBreakdown;
  explanation: string;
}

/**
 * Transparent, explainable priority scoring function combining:
 * 1. Clinical priority tier weight (Emergency=100, Urgent=60, Routine=20)
 * 2. Time-to-deadline pressure (up to +40 pts when required within <= 2 hours)
 * 3. Supply shortage pressure (up to +25 pts when compatible stock < required units)
 * 4. Queue waiting age (up to +15 pts based on request age)
 * 5. Volume demand factor (up to +15 pts)
 */
export function calculatePriorityScore(
  input: PriorityScoreInput,
  weights: PriorityWeights = DEFAULT_PRIORITY_WEIGHTS,
  now: Date = new Date(),
): PriorityScoreResult {
  const baseWeight =
    input.priority === 'Emergency'
      ? weights.emergencyWeight
      : input.priority === 'Urgent'
        ? weights.urgentWeight
        : weights.routineWeight;

  const requiredByMs = new Date(input.requiredByDate).getTime();
  let timeUrgencyBonus = 0;
  if (!Number.isNaN(requiredByMs)) {
    const hoursUntilDue = (requiredByMs - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntilDue <= 2) {
      timeUrgencyBonus = 40;
    } else if (hoursUntilDue <= 6) {
      timeUrgencyBonus = 30;
    } else if (hoursUntilDue <= 24) {
      timeUrgencyBonus = 20;
    } else if (hoursUntilDue <= 72) {
      timeUrgencyBonus = 10;
    } else {
      timeUrgencyBonus = 4;
    }
  }

  let shortageBonus = 0;
  if (input.availableCompatibleUnits <= 0) {
    shortageBonus = 25;
  } else if (input.availableCompatibleUnits < input.unitsRequired) {
    shortageBonus = 18;
  } else if (input.availableCompatibleUnits < input.unitsRequired * 2) {
    shortageBonus = 8;
  }

  let ageBonus = 0;
  if (input.requestDate) {
    const createdMs = new Date(input.requestDate).getTime();
    if (!Number.isNaN(createdMs)) {
      const hoursWaiting = Math.max(0, (now.getTime() - createdMs) / (1000 * 60 * 60));
      ageBonus = Math.min(15, Math.round((hoursWaiting / 4) * 10) / 10);
    }
  }

  const volumeBonus = Math.min(15, Math.max(1, input.unitsRequired) * 2.5);
  const score =
    Math.round(
      (baseWeight + timeUrgencyBonus + shortageBonus + ageBonus + volumeBonus) * 10,
    ) / 10;

  const explanation = `${input.priority} base (${baseWeight}) + deadline urgency (+${timeUrgencyBonus}) + stock scarcity (+${shortageBonus}) + wait age (+${ageBonus}) + volume (+${volumeBonus})`;

  return {
    score,
    breakdown: {
      baseWeight,
      timeUrgencyBonus,
      shortageBonus,
      ageBonus,
      volumeBonus,
    },
    explanation,
  };
}
