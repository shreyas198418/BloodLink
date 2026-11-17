import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const pgVector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 128})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    if (!value) return [];
    return value
      .replace(/^\[|\]$/g, '')
      .split(',')
      .filter(Boolean)
      .map(Number);
  },
});

export const bloodBanks = pgTable(
  'blood_banks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bankCode: text('bank_code').notNull().unique(),
    name: text('name').notNull(),
    city: text('city').notNull(),
    address: text('address').notNull(),
    latitude: doublePrecision('latitude').notNull().default(0),
    longitude: doublePrecision('longitude').notNull().default(0),
    contactNumber: text('contact_number').notNull(),
    email: text('email').notNull().unique(),
    operatingStatus: text('operating_status').notNull().default('Active'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_blood_banks_city').on(table.city),
    check(
      'chk_blood_banks_status',
      sql`${table.operatingStatus} IN ('Active', 'Limited', 'Closed')`,
    ),
  ],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    uid: text('uid').unique(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash'),
    fullName: text('full_name').notNull(),
    role: text('role').notNull().default('STAFF'),
    bloodBankId: uuid('blood_bank_id').references(() => bloodBanks.id, {
      onDelete: 'set null',
    }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_users_role').on(table.role),
    check('chk_users_role', sql`${table.role} IN ('ADMIN', 'STAFF')`),
  ],
);

export const donors = pgTable(
  'donors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    donorCode: text('donor_code').notNull().unique(),
    fullName: text('full_name').notNull(),
    dateOfBirth: text('date_of_birth').notNull(),
    bloodGroup: text('blood_group').notNull(),
    rhFactor: text('rh_factor').notNull(),
    phoneNumber: text('phone_number').notNull().unique(),
    email: text('email').notNull().unique(),
    city: text('city').notNull(),
    address: text('address').notNull(),
    latitude: doublePrecision('latitude').notNull().default(0),
    longitude: doublePrecision('longitude').notNull().default(0),
    lastDonationDate: text('last_donation_date'),
    availabilityStatus: text('availability_status').notNull().default('Available'),
    associatedBankId: uuid('associated_bank_id').references(() => bloodBanks.id, {
      onDelete: 'set null',
    }),
    isActive: boolean('is_active').notNull().default(true),
    registeredAt: timestamp('registered_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_donors_blood_group').on(table.bloodGroup),
    index('idx_donors_city').on(table.city),
    check(
      'chk_donors_blood_group',
      sql`${table.bloodGroup} IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')`,
    ),
    check(
      'chk_donors_rh_factor',
      sql`${table.rhFactor} IN ('Positive', 'Negative')`,
    ),
    check(
      'chk_donors_availability',
      sql`${table.availabilityStatus} IN ('Available', 'Unavailable', 'Deferred')`,
    ),
  ],
);

export const bloodInventory = pgTable(
  'blood_inventory',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bloodBankId: uuid('blood_bank_id')
      .notNull()
      .references(() => bloodBanks.id, { onDelete: 'cascade' }),
    bloodGroup: text('blood_group').notNull(),
    rhFactor: text('rh_factor').notNull(),
    unitsAvailable: integer('units_available').notNull(),
    minimumThreshold: integer('minimum_threshold').notNull().default(5),
    collectionDate: text('collection_date').notNull(),
    expiryDate: text('expiry_date').notNull(),
    inventoryStatus: text('inventory_status').notNull().default('Available'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_inventory_blood_group').on(table.bloodGroup),
    index('idx_inventory_bank').on(table.bloodBankId),
    index('idx_inventory_expiry').on(table.expiryDate),
    check('chk_inventory_non_negative', sql`${table.unitsAvailable} >= 0`),
    check('chk_inventory_threshold_positive', sql`${table.minimumThreshold} >= 0`),
    check(
      'chk_inventory_blood_group',
      sql`${table.bloodGroup} IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')`,
    ),
    check(
      'chk_inventory_status',
      sql`${table.inventoryStatus} IN ('Available', 'Low Stock', 'Expired', 'Depleted')`,
    ),
  ],
);

export const bloodRequests = pgTable(
  'blood_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestCode: text('request_code').notNull().unique(),
    hospitalName: text('hospital_name').notNull(),
    hospitalLocation: text('hospital_location').notNull(),
    latitude: doublePrecision('latitude').notNull().default(0),
    longitude: doublePrecision('longitude').notNull().default(0),
    contactPerson: text('contact_person').notNull(),
    contactPhone: text('contact_phone').notNull(),
    requiredBloodGroup: text('required_blood_group').notNull(),
    rhFactor: text('rh_factor').notNull(),
    unitsRequired: integer('units_required').notNull(),
    unitsFulfilled: integer('units_fulfilled').notNull().default(0),
    priority: text('priority').notNull().default('Routine'),
    priorityScore: doublePrecision('priority_score').notNull().default(20),
    requestDescription: text('request_description').notNull(),
    medicalUrgencyNotes: text('medical_urgency_notes').default(''),
    extractedContext: jsonb('extracted_context').$type<Record<string, unknown>>(),
    requestDate: timestamp('request_date').defaultNow().notNull(),
    requiredByDate: text('required_by_date').notNull(),
    status: text('status').notNull().default('Pending'),
    assignedBankId: uuid('assigned_bank_id').references(() => bloodBanks.id, {
      onDelete: 'set null',
    }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    index('idx_requests_priority').on(table.priority, table.priorityScore),
    index('idx_requests_status').on(table.status),
    index('idx_requests_blood_group').on(table.requiredBloodGroup),
    check('chk_requests_units_positive', sql`${table.unitsRequired} > 0`),
    check('chk_requests_fulfilled_non_neg', sql`${table.unitsFulfilled} >= 0`),
    check(
      'chk_requests_priority',
      sql`${table.priority} IN ('Emergency', 'Urgent', 'Routine')`,
    ),
    check(
      'chk_requests_status',
      sql`${table.status} IN ('Pending', 'Processing', 'Matched', 'Partially Fulfilled', 'Fulfilled', 'Rejected', 'Cancelled')`,
    ),
    check(
      'chk_requests_blood_group',
      sql`${table.requiredBloodGroup} IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')`,
    ),
  ],
);

export const donorMatches = pgTable(
  'donor_matches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => bloodRequests.id, { onDelete: 'cascade' }),
    donorId: uuid('donor_id').references(() => donors.id, { onDelete: 'set null' }),
    bloodBankId: uuid('blood_bank_id').references(() => bloodBanks.id, {
      onDelete: 'set null',
    }),
    matchType: text('match_type').notNull(),
    matchScore: doublePrecision('match_score').notNull(),
    distanceKm: doublePrecision('distance_km'),
    explanation: text('explanation').notNull(),
    status: text('status').notNull().default('Suggested'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_matches_request').on(table.requestId),
    check(
      'chk_matches_type',
      sql`${table.matchType} IN ('DONOR', 'BLOOD_BANK')`,
    ),
    check(
      'chk_matches_status',
      sql`${table.status} IN ('Suggested', 'Confirmed', 'Allocated', 'Declined')`,
    ),
  ],
);

export const requestStatusHistory = pgTable(
  'request_status_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => bloodRequests.id, { onDelete: 'cascade' }),
    previousStatus: text('previous_status'),
    newStatus: text('new_status').notNull(),
    previousPriority: text('previous_priority'),
    newPriority: text('new_priority'),
    changedByUserId: uuid('changed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    notes: text('notes').default(''),
    changedAt: timestamp('changed_at').defaultNow().notNull(),
  },
  (table) => [index('idx_status_history_request').on(table.requestId)],
);

export const inventoryTransactions = pgTable(
  'inventory_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    inventoryId: uuid('inventory_id')
      .notNull()
      .references(() => bloodInventory.id, { onDelete: 'cascade' }),
    bloodBankId: uuid('blood_bank_id')
      .notNull()
      .references(() => bloodBanks.id, { onDelete: 'cascade' }),
    requestId: uuid('request_id').references(() => bloodRequests.id, {
      onDelete: 'set null',
    }),
    transactionType: text('transaction_type').notNull(),
    unitsDelta: integer('units_delta').notNull(),
    unitsAfter: integer('units_after').notNull(),
    performedByUserId: uuid('performed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    notes: text('notes').default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_inv_tx_bank').on(table.bloodBankId),
    index('idx_inv_tx_inventory').on(table.inventoryId),
    check(
      'chk_inv_tx_type',
      sql`${table.transactionType} IN ('ADD', 'RESTOCK', 'ALLOCATE', 'ADJUST', 'EXPIRE')`,
    ),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bloodBankId: uuid('blood_bank_id').references(() => bloodBanks.id, {
      onDelete: 'set null',
    }),
    severity: text('severity').notNull().default('Info'),
    title: text('title').notNull(),
    message: text('message').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    check(
      'chk_notifications_severity',
      sql`${table.severity} IN ('Critical', 'Warning', 'Info')`,
    ),
  ],
);

export const requestEmbeddings = pgTable(
  'request_embeddings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: uuid('request_id')
      .notNull()
      .unique()
      .references(() => bloodRequests.id, { onDelete: 'cascade' }),
    embeddingModel: text('embedding_model')
      .notNull()
      .default('bloodlink-semantic-v1-128d'),
    embedding: pgVector('embedding', { dimensions: 128 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_embeddings_request').on(table.requestId)],
);

export const systemSettings = pgTable('system_settings', {
  id: text('id').primaryKey(),
  minDonationIntervalDays: integer('min_donation_interval_days').notNull().default(56),
  minDonorAge: integer('min_donor_age').notNull().default(18),
  maxDonorAge: integer('max_donor_age').notNull().default(65),
  defaultLowStockThreshold: integer('default_low_stock_threshold').notNull().default(6),
  emergencyWeight: integer('emergency_weight').notNull().default(100),
  urgentWeight: integer('urgent_weight').notNull().default(60),
  routineWeight: integer('routine_weight').notNull().default(20),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
