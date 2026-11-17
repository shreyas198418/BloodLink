import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canDonorDonateToRecipient,
  evaluateDonorScreeningEligibility,
  getCompatibleDonorGroups,
} from '../src/lib/blood-compatibility.ts';
import { calculatePriorityScore } from '../src/lib/priority-scoring.ts';
import { matchDonorsAndInventory } from '../src/lib/matching-engine.ts';
import {
  cosineSimilarity,
  extractRequestContext,
  generateLocalSemanticEmbedding,
} from '../src/lib/semantic-embedding.ts';
import {
  validateBloodRequestInput,
  validateDonorInput,
  validateInventoryInput,
} from '../src/lib/validation.ts';

test('RBC compatibility enforces Rh and ABO safety rules', () => {
  assert.equal(canDonorDonateToRecipient('O-', 'AB+'), true);
  assert.equal(canDonorDonateToRecipient('O+', 'O-'), false);
  assert.equal(canDonorDonateToRecipient('A-', 'A+'), true);
  assert.equal(canDonorDonateToRecipient('B+', 'A+'), false);
  assert.deepEqual(getCompatibleDonorGroups('O-'), ['O-']);
  assert.equal(getCompatibleDonorGroups('AB+').length, 8);
});

test('Donor screening rule enforces 56-day donation interval and age range', () => {
  const ref = new Date('2026-11-17T00:00:00Z');
  const eligible = evaluateDonorScreeningEligibility(
    {
      dateOfBirth: '1994-05-10',
      lastDonationDate: '2026-08-01',
      availabilityStatus: 'Available',
      isActive: true,
    },
    undefined,
    ref,
  );
  assert.equal(eligible.eligible, true);

  const tooRecent = evaluateDonorScreeningEligibility(
    {
      dateOfBirth: '1994-05-10',
      lastDonationDate: '2026-10-25',
      availabilityStatus: 'Available',
      isActive: true,
    },
    undefined,
    ref,
  );
  assert.equal(tooRecent.eligible, false);
  assert.match(tooRecent.reasons[0], /56 days/);
});

test('Priority scoring ranks Emergency above Urgent and Routine with shortage & deadline bonuses', () => {
  const now = new Date('2026-11-17T08:00:00Z');
  const emergency = calculatePriorityScore(
    {
      priority: 'Emergency',
      requiredByDate: '2026-11-17T09:30:00Z',
      requestDate: '2026-11-17T06:00:00Z',
      unitsRequired: 4,
      availableCompatibleUnits: 1,
    },
    undefined,
    now,
  );
  const routine = calculatePriorityScore(
    {
      priority: 'Routine',
      requiredByDate: '2026-11-22T08:00:00Z',
      requestDate: '2026-11-17T07:30:00Z',
      unitsRequired: 2,
      availableCompatibleUnits: 12,
    },
    undefined,
    now,
  );
  assert.ok(emergency.score > routine.score + 80);
  assert.equal(emergency.breakdown.baseWeight, 100);
  assert.equal(emergency.breakdown.timeUrgencyBonus, 40);
});

test('Matching engine excludes expired inventory and ineligible donors while ranking valid matches', () => {
  const ref = new Date('2026-11-17T00:00:00Z');
  const result = matchDonorsAndInventory(
    {
      id: 'req-1',
      requiredBloodGroup: 'A+',
      unitsRequired: 3,
      unitsFulfilled: 0,
      priority: 'Emergency',
      latitude: 1.3521,
      longitude: 103.8198,
      hospitalLocation: 'Central',
    },
    [
      {
        id: 'd-1',
        donorCode: 'DNR-01',
        fullName: 'Eligible O- Donor',
        dateOfBirth: '1992-03-14',
        bloodGroup: 'O-',
        city: 'Central',
        latitude: 1.355,
        longitude: 103.82,
        lastDonationDate: '2026-07-01',
        availabilityStatus: 'Available',
        associatedBankId: null,
        isActive: true,
      },
      {
        id: 'd-2',
        donorCode: 'DNR-02',
        fullName: 'Incompatible B+ Donor',
        dateOfBirth: '1990-01-10',
        bloodGroup: 'B+',
        city: 'Central',
        latitude: 1.352,
        longitude: 103.82,
        lastDonationDate: null,
        availabilityStatus: 'Available',
        associatedBankId: null,
        isActive: true,
      },
    ],
    [
      {
        id: 'inv-1',
        bloodBankId: 'b-1',
        bankName: 'Metro Central',
        bankCity: 'Central',
        bankLatitude: 1.35,
        bankLongitude: 103.82,
        operatingStatus: 'Active',
        bloodGroup: 'A+',
        unitsAvailable: 5,
        minimumThreshold: 4,
        expiryDate: '2026-12-10',
      },
      {
        id: 'inv-2',
        bloodBankId: 'b-2',
        bankName: 'Expired Batch Bank',
        bankCity: 'East',
        bankLatitude: 1.36,
        bankLongitude: 103.85,
        operatingStatus: 'Active',
        bloodGroup: 'A+',
        unitsAvailable: 10,
        minimumThreshold: 4,
        expiryDate: '2026-11-01',
      },
    ],
    undefined,
    ref,
  );

  assert.equal(result.compatibleDonors.length, 1);
  assert.equal(result.ineligibleDonors.length, 1);
  assert.equal(result.compatibleBanks.length, 1);
  assert.equal(result.excludedBanks.length, 1);
  assert.equal(result.excludedBanks[0].isExpired, true);
});

test('Semantic embedding & context extractor parse request text and preserve similarity ordering', () => {
  const ctx = extractRequestContext(
    'We need two units of O negative blood immediately after a serious highway accident.',
  );
  assert.equal(ctx.detectedBloodGroup, 'O-');
  assert.equal(ctx.detectedUnits, 2);
  assert.equal(ctx.suggestedPriority, 'Emergency');
  assert.ok(ctx.medicalContext.includes('Trauma & Emergency Care'));
  assert.equal(ctx.urgencyIndicators.includes('er'), false);

  const vEmergency = generateLocalSemanticEmbedding(
    'Patient needs O negative blood immediately after serious traffic accident trauma',
  );
  const vSimilar = generateLocalSemanticEmbedding(
    'Critical road accident trauma patient requires emergency blood transfusion stat',
  );
  const vScheduled = generateLocalSemanticEmbedding(
    'Routine scheduled anemia maintenance transfusion planned for next week',
  );

  assert.equal(vEmergency.length, 128);
  assert.ok(
    cosineSimilarity(vEmergency, vSimilar) > cosineSimilarity(vEmergency, vScheduled),
  );
});

test('Input validators reject negative inventory, bad expiry dates, and malformed donor/request fields', () => {
  const invBad = validateInventoryInput({
    bloodBankId: 'bank-1',
    bloodGroup: 'O+',
    unitsAvailable: -3,
    collectionDate: '2026-11-10',
    expiryDate: '2026-11-05',
  });
  assert.equal(invBad.valid, false);
  assert.ok(invBad.errors.length >= 2);

  const donorBad = validateDonorInput({
    fullName: '',
    dateOfBirth: 'invalid',
    bloodGroup: 'X+',
    phoneNumber: '12',
    email: 'not-an-email',
    city: '',
    address: '',
  });
  assert.equal(donorBad.valid, false);

  const reqOk = validateBloodRequestInput({
    hospitalName: 'City General Hospital',
    hospitalLocation: 'Downtown Medical District',
    contactPerson: 'Dr. Nair',
    contactPhone: '+65 6123 4567',
    requiredBloodGroup: 'O-',
    unitsRequired: 2,
    priority: 'Emergency',
    requestDescription: 'Urgent surgical hemorrhage requires 2 units of O- immediately.',
    requiredByDate: '2026-11-18T12:00:00Z',
  });
  assert.equal(reqOk.valid, true);
});
