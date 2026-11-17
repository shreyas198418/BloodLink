import bcrypt from 'bcryptjs';
import { count } from 'drizzle-orm';
import { db } from './index.ts';
import {
  bloodBanks,
  bloodInventory,
  bloodRequests,
  donorMatches,
  donors,
  inventoryTransactions,
  notifications,
  requestEmbeddings,
  requestStatusHistory,
  systemSettings,
  users,
} from './schema.ts';
import { parseRhFactor, type BloodGroup } from '../lib/blood-compatibility.ts';
import { calculatePriorityScore } from '../lib/priority-scoring.ts';
import {
  extractRequestContext,
  generateLocalSemanticEmbedding,
} from '../lib/semantic-embedding.ts';

let seedPromise: Promise<void> | null = null;

function daysFromToday(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function hoursFromNowIso(offsetHours: number): string {
  const d = new Date();
  d.setTime(d.getTime() + offsetHours * 60 * 60 * 1000);
  return d.toISOString();
}

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeedIfEmpty().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function runSeedIfEmpty(): Promise<void> {
  const [{ value: bankCount }] = await db
    .select({ value: count() })
    .from(bloodBanks);

  if (Number(bankCount) > 0) {
    return;
  }

  // 1. System Settings (Eligibility Policy & Priority Weights)
  await db
    .insert(systemSettings)
    .values({
      id: 'default',
      minDonationIntervalDays: 56,
      minDonorAge: 18,
      maxDonorAge: 65,
      defaultLowStockThreshold: 6,
      emergencyWeight: 100,
      urgentWeight: 60,
      routineWeight: 20,
    })
    .onConflictDoNothing();

  // 2. Four Multi-Region Blood Banks
  const banksData = [
    {
      bankCode: 'BB-101',
      name: 'Metro Central Blood Bank',
      city: 'Central District',
      address: '420 Medical Parkway, Suite 200, Central District',
      latitude: 1.3048,
      longitude: 103.8318,
      contactNumber: '+65 6221 4400',
      email: 'central@bloodlink-network.org',
      operatingStatus: 'Active',
    },
    {
      bankCode: 'BB-102',
      name: 'Mercy Regional Blood Center',
      city: 'Northshore',
      address: '88 Mercy Boulevard, Northshore Medical Plaza',
      latitude: 1.3644,
      longitude: 103.8482,
      contactNumber: '+65 6489 7720',
      email: 'mercy@bloodlink-network.org',
      operatingStatus: 'Active',
    },
    {
      bankCode: 'BB-103',
      name: 'St. Jude Trauma Blood Bank',
      city: 'Westgate',
      address: '15 Trauma Care Way, Westgate Campus',
      latitude: 1.3341,
      longitude: 103.7435,
      contactNumber: '+65 6774 9100',
      email: 'stjude@bloodlink-network.org',
      operatingStatus: 'Active',
    },
    {
      bankCode: 'BB-104',
      name: 'Harborview Community Blood Bank',
      city: 'East Coast',
      address: '712 Harborview Avenue, East Coast Wing',
      latitude: 1.3189,
      longitude: 103.9214,
      contactNumber: '+65 6345 2190',
      email: 'harborview@bloodlink-network.org',
      operatingStatus: 'Limited',
    },
  ];

  const insertedBanks = await db
    .insert(bloodBanks)
    .values(banksData)
    .returning();

  const [centralBank, mercyBank, stJudeBank, harborBank] = insertedBanks;

  // 3. Demo Users (Admin + 2 Bank Staff accounts with bcrypt hashes)
  const adminHash = await bcrypt.hash('Admin@1234', 10);
  const staffHash = await bcrypt.hash('Staff@1234', 10);

  const insertedUsers = await db
    .insert(users)
    .values([
      {
        email: 'admin@bloodlink.org',
        passwordHash: adminHash,
        fullName: 'Dr. Elena Vance',
        role: 'ADMIN',
        bloodBankId: null,
        isActive: true,
      },
      {
        email: 'staff.central@bloodlink.org',
        passwordHash: staffHash,
        fullName: 'Marcus Chen',
        role: 'STAFF',
        bloodBankId: centralBank.id,
        isActive: true,
      },
      {
        email: 'staff.mercy@bloodlink.org',
        passwordHash: staffHash,
        fullName: 'Priya Nair',
        role: 'STAFF',
        bloodBankId: mercyBank.id,
        isActive: true,
      },
    ])
    .returning();

  const adminUser = insertedUsers[0];

  // 4. Fourteen Donors covering all 8 blood groups, eligible + recently donated + unavailable
  const donorsSeed: Array<{
    donorCode: string;
    fullName: string;
    dateOfBirth: string;
    bloodGroup: BloodGroup;
    phoneNumber: string;
    email: string;
    city: string;
    address: string;
    latitude: number;
    longitude: number;
    lastDonationDate: string | null;
    availabilityStatus: 'Available' | 'Unavailable' | 'Deferred';
    associatedBankId: string;
  }> = [
    {
      donorCode: 'DNR-1001',
      fullName: 'Arjun Subramanian',
      dateOfBirth: '1993-04-12',
      bloodGroup: 'O-',
      phoneNumber: '+65 9102 3301',
      email: 'arjun.subramanian@donor-demo.org',
      city: 'Central District',
      address: '14 Orchard Grove, Central District',
      latitude: 1.3065,
      longitude: 103.8331,
      lastDonationDate: daysFromToday(-112),
      availabilityStatus: 'Available',
      associatedBankId: centralBank.id,
    },
    {
      donorCode: 'DNR-1002',
      fullName: 'Mei Ling Tan',
      dateOfBirth: '1996-09-23',
      bloodGroup: 'O-',
      phoneNumber: '+65 9102 3302',
      email: 'meiling.tan@donor-demo.org',
      city: 'Westgate',
      address: '29 Jurong Terrace, Westgate',
      latitude: 1.3358,
      longitude: 103.7462,
      lastDonationDate: daysFromToday(-84),
      availabilityStatus: 'Available',
      associatedBankId: stJudeBank.id,
    },
    {
      donorCode: 'DNR-1003',
      fullName: 'Daniel Kowalski',
      dateOfBirth: '1988-11-05',
      bloodGroup: 'O+',
      phoneNumber: '+65 9102 3303',
      email: 'daniel.kowalski@donor-demo.org',
      city: 'Northshore',
      address: '51 Bishan Crest, Northshore',
      latitude: 1.3512,
      longitude: 103.8491,
      lastDonationDate: daysFromToday(-21), // Ineligible under 56-day screening rule
      availabilityStatus: 'Available',
      associatedBankId: mercyBank.id,
    },
    {
      donorCode: 'DNR-1004',
      fullName: 'Farah Al-Mansoor',
      dateOfBirth: '1991-02-18',
      bloodGroup: 'A+',
      phoneNumber: '+65 9102 3304',
      email: 'farah.mansoor@donor-demo.org',
      city: 'Central District',
      address: '82 River Valley Walk, Central District',
      latitude: 1.2981,
      longitude: 103.8378,
      lastDonationDate: daysFromToday(-95),
      availabilityStatus: 'Available',
      associatedBankId: centralBank.id,
    },
    {
      donorCode: 'DNR-1005',
      fullName: 'Liam OConnor',
      dateOfBirth: '1990-07-30',
      bloodGroup: 'A-',
      phoneNumber: '+65 9102 3305',
      email: 'liam.oconnor@donor-demo.org',
      city: 'Central District',
      address: '19 Newton Heights, Central District',
      latitude: 1.3127,
      longitude: 103.8392,
      lastDonationDate: null,
      availabilityStatus: 'Available',
      associatedBankId: centralBank.id,
    },
    {
      donorCode: 'DNR-1006',
      fullName: 'Sofia Rodriguez',
      dateOfBirth: '1995-01-14',
      bloodGroup: 'B+',
      phoneNumber: '+65 9102 3306',
      email: 'sofia.rodriguez@donor-demo.org',
      city: 'East Coast',
      address: '104 Marine Parade, East Coast',
      latitude: 1.3025,
      longitude: 103.9052,
      lastDonationDate: daysFromToday(-70),
      availabilityStatus: 'Available',
      associatedBankId: harborBank.id,
    },
    {
      donorCode: 'DNR-1007',
      fullName: 'Kenji Takahashi',
      dateOfBirth: '1986-06-08',
      bloodGroup: 'B-',
      phoneNumber: '+65 9102 3307',
      email: 'kenji.takahashi@donor-demo.org',
      city: 'Northshore',
      address: '33 Ang Mo Kio Ave 4, Northshore',
      latitude: 1.3712,
      longitude: 103.8415,
      lastDonationDate: daysFromToday(-130),
      availabilityStatus: 'Available',
      associatedBankId: mercyBank.id,
    },
    {
      donorCode: 'DNR-1008',
      fullName: 'Hannah Park',
      dateOfBirth: '1998-12-01',
      bloodGroup: 'AB+',
      phoneNumber: '+65 9102 3308',
      email: 'hannah.park@donor-demo.org',
      city: 'Westgate',
      address: '45 Clementi Woods, Westgate',
      latitude: 1.3155,
      longitude: 103.7654,
      lastDonationDate: daysFromToday(-65),
      availabilityStatus: 'Available',
      associatedBankId: stJudeBank.id,
    },
    {
      donorCode: 'DNR-1009',
      fullName: 'Samuel Mensah',
      dateOfBirth: '1989-08-19',
      bloodGroup: 'AB-',
      phoneNumber: '+65 9102 3309',
      email: 'samuel.mensah@donor-demo.org',
      city: 'Central District',
      address: '77 Tiong Bahru Lane, Central District',
      latitude: 1.2862,
      longitude: 103.8295,
      lastDonationDate: daysFromToday(-90),
      availabilityStatus: 'Unavailable',
      associatedBankId: centralBank.id,
    },
    {
      donorCode: 'DNR-1010',
      fullName: 'Nadia Petrova',
      dateOfBirth: '1994-03-27',
      bloodGroup: 'O+',
      phoneNumber: '+65 9102 3310',
      email: 'nadia.petrova@donor-demo.org',
      city: 'East Coast',
      address: '22 Bedok South Ave, East Coast',
      latitude: 1.3245,
      longitude: 103.9311,
      lastDonationDate: daysFromToday(-75),
      availabilityStatus: 'Available',
      associatedBankId: harborBank.id,
    },
    {
      donorCode: 'DNR-1011',
      fullName: 'Wei Jie Lim',
      dateOfBirth: '1997-05-11',
      bloodGroup: 'A+',
      phoneNumber: '+65 9102 3311',
      email: 'weijie.lim@donor-demo.org',
      city: 'Northshore',
      address: '61 Yishun Ring Rd, Northshore',
      latitude: 1.4251,
      longitude: 103.8358,
      lastDonationDate: daysFromToday(-140),
      availabilityStatus: 'Available',
      associatedBankId: mercyBank.id,
    },
    {
      donorCode: 'DNR-1012',
      fullName: 'Claire Dubois',
      dateOfBirth: '1992-10-03',
      bloodGroup: 'B+',
      phoneNumber: '+65 9102 3312',
      email: 'claire.dubois@donor-demo.org',
      city: 'Central District',
      address: '9 Novena Rise, Central District',
      latitude: 1.3204,
      longitude: 103.8438,
      lastDonationDate: daysFromToday(-15), // Ineligible recent donor
      availabilityStatus: 'Available',
      associatedBankId: centralBank.id,
    },
    {
      donorCode: 'DNR-1013',
      fullName: 'Rohan Kulkarni',
      dateOfBirth: '1987-02-09',
      bloodGroup: 'O-',
      phoneNumber: '+65 9102 3313',
      email: 'rohan.kulkarni@donor-demo.org',
      city: 'Northshore',
      address: '108 Serangoon Gardens, Northshore',
      latitude: 1.3642,
      longitude: 103.8655,
      lastDonationDate: daysFromToday(-101),
      availabilityStatus: 'Available',
      associatedBankId: mercyBank.id,
    },
    {
      donorCode: 'DNR-1014',
      fullName: 'Amira Hassan',
      dateOfBirth: '1995-11-22',
      bloodGroup: 'AB-',
      phoneNumber: '+65 9102 3314',
      email: 'amira.hassan@donor-demo.org',
      city: 'Westgate',
      address: '8 Bukit Batok Central, Westgate',
      latitude: 1.3491,
      longitude: 103.7495,
      lastDonationDate: null,
      availabilityStatus: 'Available',
      associatedBankId: stJudeBank.id,
    },
  ];

  const insertedDonors = await db
    .insert(donors)
    .values(
      donorsSeed.map((d) => ({
        ...d,
        rhFactor: parseRhFactor(d.bloodGroup),
        isActive: true,
      })),
    )
    .returning();

  // 5. 24 Inventory Batches across all 4 banks and all 8 blood groups
  // Includes healthy stock, low stock warnings, and 2 expired batches for safety verification
  const inventorySeed: Array<{
    bloodBankId: string;
    bloodGroup: BloodGroup;
    unitsAvailable: number;
    minimumThreshold: number;
    collectionDaysAgo: number;
    expiryDaysOffset: number;
  }> = [
    // Metro Central
    { bloodBankId: centralBank.id, bloodGroup: 'O+', unitsAvailable: 26, minimumThreshold: 10, collectionDaysAgo: 7, expiryDaysOffset: 28 },
    { bloodBankId: centralBank.id, bloodGroup: 'O-', unitsAvailable: 3, minimumThreshold: 6, collectionDaysAgo: 10, expiryDaysOffset: 25 }, // Low stock
    { bloodBankId: centralBank.id, bloodGroup: 'A+', unitsAvailable: 22, minimumThreshold: 8, collectionDaysAgo: 5, expiryDaysOffset: 30 },
    { bloodBankId: centralBank.id, bloodGroup: 'A-', unitsAvailable: 7, minimumThreshold: 5, collectionDaysAgo: 9, expiryDaysOffset: 26 },
    { bloodBankId: centralBank.id, bloodGroup: 'B+', unitsAvailable: 14, minimumThreshold: 6, collectionDaysAgo: 6, expiryDaysOffset: 29 },
    { bloodBankId: centralBank.id, bloodGroup: 'AB+', unitsAvailable: 9, minimumThreshold: 4, collectionDaysAgo: 4, expiryDaysOffset: 31 },
    { bloodBankId: centralBank.id, bloodGroup: 'B-', unitsAvailable: 6, minimumThreshold: 4, collectionDaysAgo: 42, expiryDaysOffset: -7 }, // Expired

    // Mercy Regional
    { bloodBankId: mercyBank.id, bloodGroup: 'O+', unitsAvailable: 18, minimumThreshold: 8, collectionDaysAgo: 8, expiryDaysOffset: 27 },
    { bloodBankId: mercyBank.id, bloodGroup: 'O-', unitsAvailable: 9, minimumThreshold: 6, collectionDaysAgo: 4, expiryDaysOffset: 31 },
    { bloodBankId: mercyBank.id, bloodGroup: 'A+', unitsAvailable: 16, minimumThreshold: 8, collectionDaysAgo: 6, expiryDaysOffset: 29 },
    { bloodBankId: mercyBank.id, bloodGroup: 'B+', unitsAvailable: 4, minimumThreshold: 7, collectionDaysAgo: 12, expiryDaysOffset: 23 }, // Low stock
    { bloodBankId: mercyBank.id, bloodGroup: 'B-', unitsAvailable: 5, minimumThreshold: 4, collectionDaysAgo: 11, expiryDaysOffset: 24 },
    { bloodBankId: mercyBank.id, bloodGroup: 'AB-', unitsAvailable: 2, minimumThreshold: 4, collectionDaysAgo: 14, expiryDaysOffset: 21 }, // Low stock

    // St. Jude Trauma
    { bloodBankId: stJudeBank.id, bloodGroup: 'O+', unitsAvailable: 21, minimumThreshold: 10, collectionDaysAgo: 3, expiryDaysOffset: 32 },
    { bloodBankId: stJudeBank.id, bloodGroup: 'O-', unitsAvailable: 11, minimumThreshold: 8, collectionDaysAgo: 4, expiryDaysOffset: 31 },
    { bloodBankId: stJudeBank.id, bloodGroup: 'A+', unitsAvailable: 15, minimumThreshold: 8, collectionDaysAgo: 7, expiryDaysOffset: 28 },
    { bloodBankId: stJudeBank.id, bloodGroup: 'A-', unitsAvailable: 3, minimumThreshold: 5, collectionDaysAgo: 15, expiryDaysOffset: 20 }, // Low stock
    { bloodBankId: stJudeBank.id, bloodGroup: 'B+', unitsAvailable: 12, minimumThreshold: 6, collectionDaysAgo: 6, expiryDaysOffset: 29 },
    { bloodBankId: stJudeBank.id, bloodGroup: 'AB+', unitsAvailable: 8, minimumThreshold: 4, collectionDaysAgo: 5, expiryDaysOffset: 30 },
    { bloodBankId: stJudeBank.id, bloodGroup: 'AB-', unitsAvailable: 4, minimumThreshold: 3, collectionDaysAgo: 45, expiryDaysOffset: -10 }, // Expired

    // Harborview Community
    { bloodBankId: harborBank.id, bloodGroup: 'O+', unitsAvailable: 13, minimumThreshold: 6, collectionDaysAgo: 9, expiryDaysOffset: 26 },
    { bloodBankId: harborBank.id, bloodGroup: 'A+', unitsAvailable: 5, minimumThreshold: 6, collectionDaysAgo: 13, expiryDaysOffset: 22 }, // Low stock
    { bloodBankId: harborBank.id, bloodGroup: 'B+', unitsAvailable: 11, minimumThreshold: 5, collectionDaysAgo: 7, expiryDaysOffset: 28 },
    { bloodBankId: harborBank.id, bloodGroup: 'B-', unitsAvailable: 2, minimumThreshold: 4, collectionDaysAgo: 10, expiryDaysOffset: 25 }, // Low stock
  ];

  const insertedInventory = await db
    .insert(bloodInventory)
    .values(
      inventorySeed.map((b) => {
        const status =
          b.expiryDaysOffset < 0
            ? 'Expired'
            : b.unitsAvailable === 0
              ? 'Depleted'
              : b.unitsAvailable <= b.minimumThreshold
                ? 'Low Stock'
                : 'Available';
        return {
          bloodBankId: b.bloodBankId,
          bloodGroup: b.bloodGroup,
          rhFactor: parseRhFactor(b.bloodGroup),
          unitsAvailable: b.unitsAvailable,
          minimumThreshold: b.minimumThreshold,
          collectionDate: daysFromToday(-b.collectionDaysAgo),
          expiryDate: daysFromToday(b.expiryDaysOffset),
          inventoryStatus: status,
        };
      }),
    )
    .returning();

  // Log initial inventory transactions
  await db.insert(inventoryTransactions).values(
    insertedInventory.slice(0, 8).map((inv) => ({
      inventoryId: inv.id,
      bloodBankId: inv.bloodBankId,
      transactionType: 'ADD',
      unitsDelta: inv.unitsAvailable,
      unitsAfter: inv.unitsAvailable,
      performedByUserId: adminUser.id,
      notes: `Initial certified batch intake (${inv.bloodGroup})`,
    })),
  );

  // 6. Twelve Realistic Blood Requests + Embeddings + Status History
  const requestsSeed: Array<{
    requestCode: string;
    hospitalName: string;
    hospitalLocation: string;
    latitude: number;
    longitude: number;
    contactPerson: string;
    contactPhone: string;
    requiredBloodGroup: BloodGroup;
    unitsRequired: number;
    unitsFulfilled: number;
    priority: 'Emergency' | 'Urgent' | 'Routine';
    requestDescription: string;
    medicalUrgencyNotes: string;
    requiredByHours: number;
    status: string;
    assignedBankId: string | null;
    daysAgoCreated: number;
  }> = [
    {
      requestCode: 'REQ-2041',
      hospitalName: 'Singapore General Trauma Center',
      hospitalLocation: 'Central District',
      latitude: 1.2795,
      longitude: 103.8355,
      contactPerson: 'Dr. Marcus Tan',
      contactPhone: '+65 6321 4880',
      requiredBloodGroup: 'O-',
      unitsRequired: 4,
      unitsFulfilled: 0,
      priority: 'Emergency',
      requestDescription:
        'A patient needs four units of O negative blood immediately after a serious highway traffic accident with acute hemorrhage.',
      medicalUrgencyNotes: 'ER Trauma Bay 1 · Active massive transfusion protocol',
      requiredByHours: 1.5,
      status: 'Pending',
      assignedBankId: centralBank.id,
      daysAgoCreated: 0,
    },
    {
      requestCode: 'REQ-2042',
      hospitalName: 'Mount Elizabeth Surgical Pavilion',
      hospitalLocation: 'Central District',
      latitude: 1.3052,
      longitude: 103.8359,
      contactPerson: 'Dr. Rachel Lim',
      contactPhone: '+65 6737 2666',
      requiredBloodGroup: 'A+',
      unitsRequired: 3,
      unitsFulfilled: 0,
      priority: 'Emergency',
      requestDescription:
        'Our hospital requires 3 units of A positive blood urgently for an emergency cardiothoracic bypass surgery.',
      medicalUrgencyNotes: 'Operating Theatre 4 · Intraoperative blood loss',
      requiredByHours: 2,
      status: 'Processing',
      assignedBankId: centralBank.id,
      daysAgoCreated: 0,
    },
    {
      requestCode: 'REQ-2043',
      hospitalName: 'KK Women & Children Hospital',
      hospitalLocation: 'Central District',
      latitude: 1.3106,
      longitude: 103.8467,
      contactPerson: 'Dr. Ananya Rao',
      contactPhone: '+65 6293 4044',
      requiredBloodGroup: 'AB-',
      unitsRequired: 2,
      unitsFulfilled: 0,
      priority: 'Emergency',
      requestDescription:
        'Critical postpartum obstetric hemorrhage patient needs 2 units of AB negative blood immediately in maternity ICU.',
      medicalUrgencyNotes: 'Maternity ICU · Rare Rh-negative crossmatch',
      requiredByHours: 2,
      status: 'Pending',
      assignedBankId: mercyBank.id,
      daysAgoCreated: 0,
    },
    {
      requestCode: 'REQ-2044',
      hospitalName: 'Khoo Teck Puat Medical Center',
      hospitalLocation: 'Northshore',
      latitude: 1.4245,
      longitude: 103.8382,
      contactPerson: 'Dr. Victor Koh',
      contactPhone: '+65 6555 8000',
      requiredBloodGroup: 'B+',
      unitsRequired: 3,
      unitsFulfilled: 1,
      priority: 'Urgent',
      requestDescription:
        'Urgent gastrointestinal bleeding case needs 3 units of B positive packed red cells within 6 hours.',
      medicalUrgencyNotes: 'Endoscopy Ward · Hemoglobin dropping',
      requiredByHours: 5,
      status: 'Partially Fulfilled',
      assignedBankId: mercyBank.id,
      daysAgoCreated: 1,
    },
    {
      requestCode: 'REQ-2045',
      hospitalName: 'Ng Teng Fong General Hospital',
      hospitalLocation: 'Westgate',
      latitude: 1.3335,
      longitude: 103.7458,
      contactPerson: 'Dr. Grace Ong',
      contactPhone: '+65 6716 2000',
      requiredBloodGroup: 'A-',
      unitsRequired: 2,
      unitsFulfilled: 0,
      priority: 'Urgent',
      requestDescription:
        'Orthopedic trauma patient requires two units of A negative blood urgently for open fracture fixation tonight.',
      medicalUrgencyNotes: 'Orthopedic OR · Pre-op crossmatch pending',
      requiredByHours: 8,
      status: 'Pending',
      assignedBankId: stJudeBank.id,
      daysAgoCreated: 1,
    },
    {
      requestCode: 'REQ-2046',
      hospitalName: 'Changi East Medical Institute',
      hospitalLocation: 'East Coast',
      latitude: 1.3402,
      longitude: 103.9495,
      contactPerson: 'Dr. Benjamin Yap',
      contactPhone: '+65 6788 8833',
      requiredBloodGroup: 'B-',
      unitsRequired: 2,
      unitsFulfilled: 0,
      priority: 'Urgent',
      requestDescription:
        'Patient requires B negative blood today for urgent vascular stent surgery following trauma complication.',
      medicalUrgencyNotes: 'Vascular Unit · Crossmatch compatible O- acceptable',
      requiredByHours: 10,
      status: 'Pending',
      assignedBankId: harborBank.id,
      daysAgoCreated: 2,
    },
    {
      requestCode: 'REQ-2047',
      hospitalName: 'National University Oncology Ward',
      hospitalLocation: 'Westgate',
      latitude: 1.2939,
      longitude: 103.7831,
      contactPerson: 'Dr. Sarah Lee',
      contactPhone: '+65 6779 5555',
      requiredBloodGroup: 'O-',
      unitsRequired: 2,
      unitsFulfilled: 0,
      priority: 'Routine',
      requestDescription:
        'We need two units of O negative blood for a scheduled oncology surgery procedure next week.',
      medicalUrgencyNotes: 'Elective Surgical Prep · Scheduled crossmatch',
      requiredByHours: 96,
      status: 'Pending',
      assignedBankId: stJudeBank.id,
      daysAgoCreated: 3,
    },
    {
      requestCode: 'REQ-2048',
      hospitalName: 'Tan Tock Seng Hematology Clinic',
      hospitalLocation: 'Central District',
      latitude: 1.3214,
      longitude: 103.8458,
      contactPerson: 'Dr. Kelvin Ng',
      contactPhone: '+65 6256 6011',
      requiredBloodGroup: 'O+',
      unitsRequired: 4,
      unitsFulfilled: 4,
      priority: 'Routine',
      requestDescription:
        'Scheduled thalassemia maintenance transfusion requiring 4 units of O positive blood for outpatient clinic.',
      medicalUrgencyNotes: 'Day Hematology Clinic · Completed',
      requiredByHours: 72,
      status: 'Fulfilled',
      assignedBankId: centralBank.id,
      daysAgoCreated: 5,
    },
    {
      requestCode: 'REQ-2049',
      hospitalName: 'Raffles Heart & Vascular Centre',
      hospitalLocation: 'Central District',
      latitude: 1.3008,
      longitude: 103.8573,
      contactPerson: 'Dr. Evelyn Chua',
      contactPhone: '+65 6311 1111',
      requiredBloodGroup: 'AB+',
      unitsRequired: 2,
      unitsFulfilled: 2,
      priority: 'Urgent',
      requestDescription:
        'Urgent valve replacement procedure requires 2 units of AB positive packed cells in cardiac suite.',
      medicalUrgencyNotes: 'Cardiac Suite 2 · Matched & dispatched',
      requiredByHours: 14,
      status: 'Matched',
      assignedBankId: centralBank.id,
      daysAgoCreated: 4,
    },
    {
      requestCode: 'REQ-2050',
      hospitalName: 'Sengkang General Hospital',
      hospitalLocation: 'Northshore',
      latitude: 1.3951,
      longitude: 103.8932,
      contactPerson: 'Dr. David Ho',
      contactPhone: '+65 6930 6000',
      requiredBloodGroup: 'A+',
      unitsRequired: 3,
      unitsFulfilled: 3,
      priority: 'Emergency',
      requestDescription:
        'Emergency multi-vehicle crash patient needs 3 units of A positive blood immediately in resuscitation bay.',
      medicalUrgencyNotes: 'Trauma Resus · Fulfilled from Mercy Regional',
      requiredByHours: 1,
      status: 'Fulfilled',
      assignedBankId: mercyBank.id,
      daysAgoCreated: 7,
    },
    {
      requestCode: 'REQ-2051',
      hospitalName: 'Parkway East Surgical Clinic',
      hospitalLocation: 'East Coast',
      latitude: 1.3147,
      longitude: 103.9092,
      contactPerson: 'Dr. Jasmine Wong',
      contactPhone: '+65 6377 3737',
      requiredBloodGroup: 'B+',
      unitsRequired: 2,
      unitsFulfilled: 0,
      priority: 'Routine',
      requestDescription:
        'Routine planned knee arthroplasty pre-operative blood reserve of 2 units B positive.',
      medicalUrgencyNotes: 'Elective Surgery · Standby unit',
      requiredByHours: 120,
      status: 'Pending',
      assignedBankId: harborBank.id,
      daysAgoCreated: 6,
    },
    {
      requestCode: 'REQ-2052',
      hospitalName: 'Alexandra Community Care',
      hospitalLocation: 'Westgate',
      latitude: 1.2865,
      longitude: 103.8012,
      contactPerson: 'Dr. Samuel Yeo',
      contactPhone: '+65 6472 2000',
      requiredBloodGroup: 'O+',
      unitsRequired: 2,
      unitsFulfilled: 0,
      priority: 'Routine',
      requestDescription:
        'Planned chronic anemia transfusion canceled after hemoglobin stabilized on iron therapy.',
      medicalUrgencyNotes: 'Outpatient Clinic · Cancelled by physician',
      requiredByHours: 48,
      status: 'Cancelled',
      assignedBankId: stJudeBank.id,
      daysAgoCreated: 9,
    },
  ];

  const now = new Date();
  const insertedRequests = [];

  for (const r of requestsSeed) {
    const reqDate = new Date(now.getTime() - r.daysAgoCreated * 24 * 60 * 60 * 1000);
    const requiredByDate = hoursFromNowIso(r.requiredByHours);
    const extractedContext = extractRequestContext(r.requestDescription);
    const scoreResult = calculatePriorityScore(
      {
        priority: r.priority,
        requiredByDate,
        requestDate: reqDate,
        unitsRequired: r.unitsRequired,
        availableCompatibleUnits: r.requiredBloodGroup.endsWith('-') ? 3 : 15,
      },
      undefined,
      now,
    );

    const [created] = await db
      .insert(bloodRequests)
      .values({
        requestCode: r.requestCode,
        hospitalName: r.hospitalName,
        hospitalLocation: r.hospitalLocation,
        latitude: r.latitude,
        longitude: r.longitude,
        contactPerson: r.contactPerson,
        contactPhone: r.contactPhone,
        requiredBloodGroup: r.requiredBloodGroup,
        rhFactor: parseRhFactor(r.requiredBloodGroup),
        unitsRequired: r.unitsRequired,
        unitsFulfilled: r.unitsFulfilled,
        priority: r.priority,
        priorityScore: scoreResult.score,
        requestDescription: r.requestDescription,
        medicalUrgencyNotes: r.medicalUrgencyNotes,
        extractedContext: extractedContext as unknown as Record<string, unknown>,
        requestDate: reqDate,
        requiredByDate,
        status: r.status,
        assignedBankId: r.assignedBankId,
        createdByUserId: adminUser.id,
      })
      .returning();

    insertedRequests.push(created);

    // Store 128-dim semantic vector in pgvector table
    const embedding = generateLocalSemanticEmbedding(
      `${r.requestDescription} ${r.medicalUrgencyNotes} ${r.requiredBloodGroup} ${r.priority}`,
    );
    await db.insert(requestEmbeddings).values({
      requestId: created.id,
      embeddingModel: 'bloodlink-semantic-v1-128d',
      embedding,
      metadata: {
        priority: r.priority,
        bloodGroup: r.requiredBloodGroup,
        unitsRequired: r.unitsRequired,
        medicalContext: extractedContext.medicalContext,
      },
    });

    await db.insert(requestStatusHistory).values({
      requestId: created.id,
      previousStatus: null,
      newStatus: r.status,
      previousPriority: null,
      newPriority: r.priority,
      changedByUserId: adminUser.id,
      notes: `Request logged (${r.priority}, score ${scoreResult.score})`,
    });
  }

  // 7. Seed sample Donor Match record & Notifications
  if (insertedRequests.length > 0 && insertedDonors.length > 0) {
    await db.insert(donorMatches).values({
      requestId: insertedRequests[0].id,
      donorId: insertedDonors[0].id,
      bloodBankId: centralBank.id,
      matchType: 'DONOR',
      matchScore: 96.4,
      distanceKm: 3.0,
      explanation: 'Exact O- universal Rh-negative match · Last donated 112d ago · 3.0 km away',
      status: 'Suggested',
    });
  }

  await db.insert(notifications).values([
    {
      bloodBankId: centralBank.id,
      severity: 'Critical',
      title: 'Low O- Stock Alert — Metro Central',
      message: 'O- reserves dropped to 3 units (minimum threshold: 6 units). Emergency request REQ-2041 requires 4 units.',
      isRead: false,
    },
    {
      bloodBankId: mercyBank.id,
      severity: 'Warning',
      title: 'Rare AB- Threshold Warning — Mercy Regional',
      message: 'AB- inventory is at 2 units (threshold: 4 units) while REQ-2043 is active.',
      isRead: false,
    },
    {
      bloodBankId: stJudeBank.id,
      severity: 'Warning',
      title: 'Expired Batch Quarantined — St. Jude Trauma',
      message: 'Batch AB- (4 units) passed expiry date and is automatically excluded from matching.',
      isRead: false,
    },
  ]);
}
