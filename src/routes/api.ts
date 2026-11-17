import express from 'express';
import bcrypt from 'bcryptjs';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
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
} from '../db/schema.ts';
import { ensureSeeded } from '../db/seed.ts';
import {
  type AuthRequest,
  requireAuth,
  requireRole,
  SESSION_COOKIE_NAME,
  signSessionToken,
  type UserRole,
} from '../middleware/auth.ts';
import {
  BLOOD_GROUPS,
  DEFAULT_ELIGIBILITY_POLICY,
  getCompatibleDonorGroups,
  isValidBloodGroup,
  parseRhFactor,
} from '../lib/blood-compatibility.ts';
import { calculatePriorityScore, type RequestPriority } from '../lib/priority-scoring.ts';
import { isBatchExpired, matchDonorsAndInventory } from '../lib/matching-engine.ts';
import {
  explainSemanticRetrieval,
  extractRequestContext,
  generateLocalSemanticEmbedding,
} from '../lib/semantic-embedding.ts';
import {
  isValidEmail,
  isValidPhone,
  validateBloodRequestInput,
  validateDonorInput,
  validateInventoryInput,
} from '../lib/validation.ts';

export const apiRouter = express.Router();

// Lazily ensure seed data exists on first API call
apiRouter.use(async (_req, res, next) => {
  try {
    await ensureSeeded();
    next();
  } catch (error) {
    console.error('Database initialization error:', error);
    res.status(500).json({ error: 'Database initialization failed.' });
  }
});

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local[0]}***@${domain}`;
}

function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length <= 4) return '****';
  return `${'*'.repeat(Math.max(4, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

async function getPolicyAndWeights() {
  const rows = await db.select().from(systemSettings).where(eq(systemSettings.id, 'default'));
  if (rows.length === 0) {
    return {
      policy: DEFAULT_ELIGIBILITY_POLICY,
      weights: { emergencyWeight: 100, urgentWeight: 60, routineWeight: 20 },
      settingsRow: null,
    };
  }
  const s = rows[0];
  return {
    policy: {
      minDonationIntervalDays: s.minDonationIntervalDays,
      minDonorAge: s.minDonorAge,
      maxDonorAge: s.maxDonorAge,
    },
    weights: {
      emergencyWeight: s.emergencyWeight,
      urgentWeight: s.urgentWeight,
      routineWeight: s.routineWeight,
    },
    settingsRow: s,
  };
}

// ==========================================
// 1. AUTHENTICATION ROUTES
// ==========================================
apiRouter.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const found = await db
      .select()
      .from(users)
      .where(eq(users.email, String(email).trim().toLowerCase()));

    const user = found[0];
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'User account has been deactivated.' });
    }

    const matches = await bcrypt.compare(String(password), user.passwordHash);
    if (!matches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    });

    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
      path: '/',
    });

    let bankName: string | null = null;
    if (user.bloodBankId) {
      const banks = await db
        .select({ name: bloodBanks.name })
        .from(bloodBanks)
        .where(eq(bloodBanks.id, user.bloodBankId));
      bankName = banks[0]?.name ?? null;
    }

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        bloodBankId: user.bloodBankId,
        bloodBankName: bankName,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Authentication failed.' });
  }
});

apiRouter.post('/auth/firebase', requireAuth, async (req: AuthRequest, res) => {
  try {
    let bankName: string | null = null;
    if (req.user?.bloodBankId) {
      const banks = await db
        .select({ name: bloodBanks.name })
        .from(bloodBanks)
        .where(eq(bloodBanks.id, req.user.bloodBankId));
      bankName = banks[0]?.name ?? null;
    }
    return res.json({
      user: {
        ...req.user,
        bloodBankName: bankName,
      },
    });
  } catch (error) {
    console.error('Firebase sync error:', error);
    return res.status(500).json({ error: 'Failed to sync authenticated profile.' });
  }
});

apiRouter.post('/auth/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  return res.json({ ok: true });
});

apiRouter.get('/auth/session', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
    const rawToken =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : cookieToken;

    if (!rawToken) {
      return res.json({ user: null });
    }

    const { verifySessionToken } = await import('../middleware/auth.ts');
    const sessionPayload = verifySessionToken(rawToken);
    if (!sessionPayload) {
      return res.json({ user: null });
    }

    const found = await db
      .select()
      .from(users)
      .where(eq(users.id, sessionPayload.userId));
    if (found.length === 0 || !found[0].isActive) {
      return res.json({ user: null });
    }

    const u = found[0];
    let bankName: string | null = null;
    if (u.bloodBankId) {
      const banks = await db
        .select({ name: bloodBanks.name })
        .from(bloodBanks)
        .where(eq(bloodBanks.id, u.bloodBankId));
      bankName = banks[0]?.name ?? null;
    }

    return res.json({
      user: {
        id: u.id,
        uid: u.uid,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        bloodBankId: u.bloodBankId,
        bloodBankName: bankName,
      },
    });
  } catch {
    return res.json({ user: null });
  }
});

apiRouter.get('/auth/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    let bankName: string | null = null;
    if (req.user?.bloodBankId) {
      const banks = await db
        .select({ name: bloodBanks.name })
        .from(bloodBanks)
        .where(eq(bloodBanks.id, req.user.bloodBankId));
      bankName = banks[0]?.name ?? null;
    }
    return res.json({
      user: {
        ...req.user,
        bloodBankName: bankName,
      },
    });
  } catch (error) {
    console.error('Session lookup error:', error);
    return res.status(500).json({ error: 'Failed to load user profile.' });
  }
});

// ==========================================
// 2. DASHBOARD LIVE AGGREGATES
// ==========================================
apiRouter.get('/dashboard', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const todayIso = new Date().toISOString().slice(0, 10);

    const [banks, allDonors, allInventory, allRequests, unreadNotifs] = await Promise.all([
      db.select().from(bloodBanks).orderBy(bloodBanks.bankCode),
      db.select().from(donors).where(eq(donors.isActive, true)),
      db.select().from(bloodInventory),
      db.select().from(bloodRequests).orderBy(desc(bloodRequests.priorityScore), desc(bloodRequests.requestDate)),
      db.select().from(notifications).where(eq(notifications.isRead, false)).orderBy(desc(notifications.createdAt)),
    ]);

    const bankNameMap = new Map(banks.map((b) => [b.id, b.name]));

    const activeBanksCount = banks.filter((b) => b.operatingStatus !== 'Closed').length;
    const pendingRequests = allRequests.filter((r) =>
      ['Pending', 'Processing', 'Partially Fulfilled'].includes(r.status),
    );
    const emergencyPendingCount = pendingRequests.filter((r) => r.priority === 'Emergency').length;

    const validInventory = allInventory.filter(
      (inv) => inv.expiryDate >= todayIso && inv.unitsAvailable > 0,
    );
    const totalAvailableUnits = validInventory.reduce((sum, inv) => sum + inv.unitsAvailable, 0);

    const bloodGroupTotals = BLOOD_GROUPS.map((group) => {
      const units = validInventory
        .filter((inv) => inv.bloodGroup === group)
        .reduce((sum, inv) => sum + inv.unitsAvailable, 0);
      return { bloodGroup: group, units };
    });

    const urgencyCounts = [
      {
        name: 'Emergency',
        value: allRequests.filter((r) => r.priority === 'Emergency').length,
        color: '#E53945',
      },
      {
        name: 'Urgent',
        value: allRequests.filter((r) => r.priority === 'Urgent').length,
        color: '#F39C38',
      },
      {
        name: 'Routine',
        value: allRequests.filter((r) => r.priority === 'Routine').length,
        color: '#27AE75',
      },
    ];

    const lowStockAlerts = allInventory
      .filter((inv) => inv.expiryDate >= todayIso && inv.unitsAvailable <= inv.minimumThreshold)
      .map((inv) => ({
        id: inv.id,
        bloodGroup: inv.bloodGroup,
        bankId: inv.bloodBankId,
        bankName: bankNameMap.get(inv.bloodBankId) || 'Unknown Bank',
        unitsAvailable: inv.unitsAvailable,
        minimumThreshold: inv.minimumThreshold,
        alertStatus: inv.unitsAvailable === 0 ? 'Depleted' : inv.unitsAvailable <= Math.ceil(inv.minimumThreshold / 2) ? 'Critical' : 'Low Stock',
      }))
      .sort((a, b) => a.unitsAvailable - b.unitsAvailable);

    const recentRequests = allRequests.slice(0, 7).map((r) => ({
      id: r.id,
      requestCode: r.requestCode,
      hospitalName: r.hospitalName,
      requiredBloodGroup: r.requiredBloodGroup,
      unitsRequired: r.unitsRequired,
      unitsFulfilled: r.unitsFulfilled,
      priority: r.priority,
      priorityScore: r.priorityScore,
      status: r.status,
      requestDate: r.requestDate,
    }));

    return res.json({
      stats: {
        totalBloodBanks: banks.length,
        activeBloodBanks: activeBanksCount,
        registeredDonors: allDonors.length,
        availableDonors: allDonors.filter((d) => d.availabilityStatus === 'Available').length,
        pendingRequests: pendingRequests.length,
        emergencyPending: emergencyPendingCount,
        availableBloodUnits: totalAvailableUnits,
        lowStockCount: lowStockAlerts.length,
      },
      inventoryByGroup: bloodGroupTotals,
      urgencyDistribution: urgencyCounts,
      recentRequests,
      lowStockAlerts,
      unreadNotificationsCount: unreadNotifs.length,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return res.status(500).json({ error: 'Failed to load dashboard metrics.' });
  }
});

// ==========================================
// 3. BLOOD BANKS ROUTES
// ==========================================
apiRouter.get('/blood-banks', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const todayIso = new Date().toISOString().slice(0, 10);
    const [banks, inv] = await Promise.all([
      db.select().from(bloodBanks).orderBy(bloodBanks.bankCode),
      db.select().from(bloodInventory),
    ]);

    const enriched = banks.map((bank) => {
      const bankInv = inv.filter((i) => i.bloodBankId === bank.id && i.expiryDate >= todayIso && i.unitsAvailable > 0);
      const totalUnits = bankInv.reduce((sum, i) => sum + i.unitsAvailable, 0);
      const availableGroups = Array.from(new Set(bankInv.map((i) => i.bloodGroup)));
      const lowStockBatches = bankInv.filter((i) => i.unitsAvailable <= i.minimumThreshold).length;
      return {
        ...bank,
        totalUnits,
        availableBloodGroups: availableGroups,
        lowStockBatches,
      };
    });

    return res.json({ bloodBanks: enriched });
  } catch (error) {
    console.error('Blood banks list error:', error);
    return res.status(500).json({ error: 'Failed to load blood banks.' });
  }
});

apiRouter.post('/blood-banks', requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
  try {
    const { name, city, address, contactNumber, email, operatingStatus, latitude, longitude } = req.body ?? {};
    if (!name?.trim() || !city?.trim() || !address?.trim()) {
      return res.status(400).json({ error: 'Name, city, and address are required.' });
    }
    if (!isValidPhone(String(contactNumber || ''))) {
      return res.status(400).json({ error: 'Valid contact phone number is required.' });
    }
    if (!isValidEmail(String(email || ''))) {
      return res.status(400).json({ error: 'Valid email address is required.' });
    }

    const [{ value: bankCount }] = await db.select({ value: count() }).from(bloodBanks);
    const bankCode = `BB-${101 + Number(bankCount) + Math.floor(Math.random() * 10)}`;

    const [created] = await db
      .insert(bloodBanks)
      .values({
        bankCode,
        name: String(name).trim(),
        city: String(city).trim(),
        address: String(address).trim(),
        contactNumber: String(contactNumber).trim(),
        email: String(email).trim().toLowerCase(),
        operatingStatus: ['Active', 'Limited', 'Closed'].includes(operatingStatus) ? operatingStatus : 'Active',
        latitude: Number(latitude) || 1.32,
        longitude: Number(longitude) || 103.85,
      })
      .returning();

    return res.status(201).json({ bloodBank: created });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('unique')) {
      return res.status(409).json({ error: 'A blood bank with that email or code already exists.' });
    }
    console.error('Create blood bank error:', error);
    return res.status(500).json({ error: 'Failed to create blood bank.' });
  }
});

apiRouter.patch('/blood-banks/:id', requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, city, address, contactNumber, email, operatingStatus } = req.body ?? {};
    const updates: Partial<typeof bloodBanks.$inferInsert> = {};
    if (name?.trim()) updates.name = String(name).trim();
    if (city?.trim()) updates.city = String(city).trim();
    if (address?.trim()) updates.address = String(address).trim();
    if (contactNumber && isValidPhone(String(contactNumber))) updates.contactNumber = String(contactNumber).trim();
    if (email && isValidEmail(String(email))) updates.email = String(email).trim().toLowerCase();
    if (['Active', 'Limited', 'Closed'].includes(operatingStatus)) updates.operatingStatus = operatingStatus;

    const updated = await db
      .update(bloodBanks)
      .set(updates)
      .where(eq(bloodBanks.id, String(id)))
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: 'Blood bank not found.' });
    }
    return res.json({ bloodBank: updated[0] });
  } catch (error) {
    console.error('Update blood bank error:', error);
    return res.status(500).json({ error: 'Failed to update blood bank.' });
  }
});

apiRouter.delete('/blood-banks/:id', requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const invRows = await db
      .select({ value: count() })
      .from(bloodInventory)
      .where(and(eq(bloodInventory.bloodBankId, id), gte(bloodInventory.unitsAvailable, 1)));

    if (Number(invRows[0]?.value ?? 0) > 0) {
      return res.status(409).json({
        error: 'Cannot delete a blood bank with active inventory units. Transfer or deplete stock first.',
      });
    }

    const deleted = await db.delete(bloodBanks).where(eq(bloodBanks.id, id)).returning();
    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Blood bank not found.' });
    }
    return res.json({ deleted: deleted[0] });
  } catch (error) {
    console.error('Delete blood bank error:', error);
    return res.status(500).json({ error: 'Failed to delete blood bank.' });
  }
});

// ==========================================
// 4. DONORS ROUTES (RBAC-Protected Privacy)
// ==========================================
apiRouter.get('/donors', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { bloodGroup, city, availability, search } = req.query;
    const [allDonors, banks] = await Promise.all([
      db.select().from(donors).orderBy(desc(donors.registeredAt)),
      db.select().from(bloodBanks),
    ]);
    const bankNameMap = new Map(banks.map((b) => [b.id, b.name]));

    let filtered = allDonors.filter((d) => d.isActive);
    if (bloodGroup && bloodGroup !== 'ALL') {
      filtered = filtered.filter((d) => d.bloodGroup === bloodGroup);
    }
    if (city && city !== 'ALL') {
      filtered = filtered.filter((d) => d.city === city);
    }
    if (availability && availability !== 'ALL') {
      filtered = filtered.filter((d) => d.availabilityStatus === availability);
    }
    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.fullName.toLowerCase().includes(q) ||
          d.donorCode.toLowerCase().includes(q) ||
          d.city.toLowerCase().includes(q),
      );
    }

    const isAdmin = req.user?.role === 'ADMIN';
    const userBankId = req.user?.bloodBankId;

    const sanitized = filtered.map((d) => {
      const canViewPersonal = isAdmin || (userBankId && d.associatedBankId === userBankId);
      return {
        ...d,
        phoneNumber: canViewPersonal ? d.phoneNumber : maskPhone(d.phoneNumber),
        email: canViewPersonal ? d.email : maskEmail(d.email),
        address: canViewPersonal ? d.address : `${d.city} (Restricted to assigned bank)`,
        associatedBankName: d.associatedBankId ? bankNameMap.get(d.associatedBankId) || null : null,
        privacyMasked: !canViewPersonal,
      };
    });

    return res.json({ donors: sanitized });
  } catch (error) {
    console.error('List donors error:', error);
    return res.status(500).json({ error: 'Failed to load donors.' });
  }
});

apiRouter.post('/donors', requireAuth, async (req: AuthRequest, res) => {
  try {
    const validation = validateDonorInput(req.body ?? {});
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join(' ') });
    }

    const {
      fullName,
      dateOfBirth,
      bloodGroup,
      phoneNumber,
      email,
      city,
      address,
      lastDonationDate,
      availabilityStatus,
      associatedBankId,
    } = req.body;

    // Duplicate check
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedPhone = String(phoneNumber).trim();
    const existing = await db.select().from(donors);
    if (existing.some((d) => d.email.toLowerCase() === normalizedEmail || d.phoneNumber === normalizedPhone)) {
      return res.status(409).json({
        error: 'Duplicate donor detected: a donor with this email or phone number already exists.',
      });
    }

    const [{ value: donorCount }] = await db.select({ value: count() }).from(donors);
    const donorCode = `DNR-${1001 + Number(donorCount) + Math.floor(Math.random() * 50)}`;

    const targetBankId =
      req.user?.role === 'STAFF' && req.user.bloodBankId
        ? req.user.bloodBankId
        : associatedBankId || null;

    const [created] = await db
      .insert(donors)
      .values({
        donorCode,
        fullName: String(fullName).trim(),
        dateOfBirth: String(dateOfBirth).trim(),
        bloodGroup,
        rhFactor: parseRhFactor(bloodGroup),
        phoneNumber: normalizedPhone,
        email: normalizedEmail,
        city: String(city).trim(),
        address: String(address).trim(),
        latitude: 1.33,
        longitude: 103.84,
        lastDonationDate: lastDonationDate ? String(lastDonationDate).trim() : null,
        availabilityStatus: ['Available', 'Unavailable', 'Deferred'].includes(availabilityStatus)
          ? availabilityStatus
          : 'Available',
        associatedBankId: targetBankId,
        isActive: true,
      })
      .returning();

    return res.status(201).json({ donor: created });
  } catch (error) {
    console.error('Create donor error:', error);
    return res.status(500).json({ error: 'Failed to register donor.' });
  }
});

apiRouter.patch('/donors/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const existingRows = await db.select().from(donors).where(eq(donors.id, id));
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Donor not found.' });
    }
    const existing = existingRows[0];

    if (
      req.user?.role === 'STAFF' &&
      existing.associatedBankId &&
      req.user.bloodBankId !== existing.associatedBankId
    ) {
      return res.status(403).json({ error: 'Staff can only edit donors assigned to their blood bank.' });
    }

    const { availabilityStatus, lastDonationDate, city, phoneNumber } = req.body ?? {};
    const updates: Partial<typeof donors.$inferInsert> = {};
    if (['Available', 'Unavailable', 'Deferred'].includes(availabilityStatus)) {
      updates.availabilityStatus = availabilityStatus;
    }
    if (lastDonationDate !== undefined) {
      updates.lastDonationDate = lastDonationDate ? String(lastDonationDate).trim() : null;
    }
    if (city?.trim()) updates.city = String(city).trim();
    if (phoneNumber && isValidPhone(String(phoneNumber))) {
      updates.phoneNumber = String(phoneNumber).trim();
    }

    const [updated] = await db.update(donors).set(updates).where(eq(donors.id, id)).returning();
    return res.json({ donor: updated });
  } catch (error) {
    console.error('Update donor error:', error);
    return res.status(500).json({ error: 'Failed to update donor.' });
  }
});

apiRouter.delete('/donors/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const existingRows = await db.select().from(donors).where(eq(donors.id, id));
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Donor not found.' });
    }
    if (
      req.user?.role === 'STAFF' &&
      existingRows[0].associatedBankId &&
      req.user.bloodBankId !== existingRows[0].associatedBankId
    ) {
      return res.status(403).json({ error: 'Staff can only deactivate donors assigned to their bank.' });
    }

    const [deactivated] = await db
      .update(donors)
      .set({ isActive: false, availabilityStatus: 'Unavailable' })
      .where(eq(donors.id, id))
      .returning();

    return res.json({ donor: deactivated });
  } catch (error) {
    console.error('Deactivate donor error:', error);
    return res.status(500).json({ error: 'Failed to deactivate donor.' });
  }
});

// ==========================================
// 5. MULTI-BANK INVENTORY & TRANSACTIONS
// ==========================================
apiRouter.get('/inventory', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { bloodGroup, bankId, expiryFilter } = req.query;
    const todayIso = new Date().toISOString().slice(0, 10);

    const [rows, banks, txRows] = await Promise.all([
      db.select().from(bloodInventory).orderBy(bloodInventory.expiryDate),
      db.select().from(bloodBanks),
      db.select().from(inventoryTransactions).orderBy(desc(inventoryTransactions.createdAt)).limit(30),
    ]);

    const bankMap = new Map(banks.map((b) => [b.id, b]));

    let items = rows.map((item) => {
      const expired = item.expiryDate < todayIso;
      const computedStatus = expired
        ? 'Expired'
        : item.unitsAvailable === 0
          ? 'Depleted'
          : item.unitsAvailable <= item.minimumThreshold
            ? 'Low Stock'
            : 'Available';
      return {
        ...item,
        inventoryStatus: computedStatus,
        isExpired: expired,
        bankName: bankMap.get(item.bloodBankId)?.name || 'Unknown Bank',
        bankCity: bankMap.get(item.bloodBankId)?.city || '',
      };
    });

    if (bloodGroup && bloodGroup !== 'ALL') {
      items = items.filter((i) => i.bloodGroup === bloodGroup);
    }
    if (bankId && bankId !== 'ALL') {
      items = items.filter((i) => i.bloodBankId === bankId);
    }
    if (expiryFilter === 'VALID') {
      items = items.filter((i) => !i.isExpired);
    } else if (expiryFilter === 'EXPIRED') {
      items = items.filter((i) => i.isExpired);
    } else if (expiryFilter === 'LOW_STOCK') {
      items = items.filter((i) => !i.isExpired && i.unitsAvailable <= i.minimumThreshold);
    }

    const groupSummary = BLOOD_GROUPS.map((bg) => ({
      bloodGroup: bg,
      validUnits: rows
        .filter((r) => r.bloodGroup === bg && r.expiryDate >= todayIso)
        .reduce((s, r) => s + r.unitsAvailable, 0),
      expiredUnits: rows
        .filter((r) => r.bloodGroup === bg && r.expiryDate < todayIso)
        .reduce((s, r) => s + r.unitsAvailable, 0),
    }));

    const transactions = txRows.map((t) => ({
      ...t,
      bankName: bankMap.get(t.bloodBankId)?.name || 'Unknown Bank',
    }));

    return res.json({ inventory: items, groupSummary, transactions });
  } catch (error) {
    console.error('Inventory list error:', error);
    return res.status(500).json({ error: 'Failed to load blood inventory.' });
  }
});

apiRouter.post('/inventory', requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body ?? {};
    const effectiveBankId =
      req.user?.role === 'STAFF' && req.user.bloodBankId
        ? req.user.bloodBankId
        : body.bloodBankId;

    const payload = {
      bloodBankId: effectiveBankId,
      bloodGroup: body.bloodGroup,
      unitsAvailable: Number(body.unitsAvailable),
      minimumThreshold: body.minimumThreshold !== undefined ? Number(body.minimumThreshold) : 5,
      collectionDate: body.collectionDate,
      expiryDate: body.expiryDate,
    };

    const validation = validateInventoryInput(payload);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join(' ') });
    }

    if (req.user?.role === 'STAFF' && req.user.bloodBankId && body.bloodBankId && body.bloodBankId !== req.user.bloodBankId) {
      return res.status(403).json({ error: 'Staff can only add inventory to their assigned blood bank.' });
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const status =
      payload.expiryDate < todayIso
        ? 'Expired'
        : payload.unitsAvailable === 0
          ? 'Depleted'
          : payload.unitsAvailable <= payload.minimumThreshold
            ? 'Low Stock'
            : 'Available';

    const created = await db.transaction(async (tx) => {
      const [inv] = await tx
        .insert(bloodInventory)
        .values({
          bloodBankId: payload.bloodBankId,
          bloodGroup: payload.bloodGroup,
          rhFactor: parseRhFactor(payload.bloodGroup),
          unitsAvailable: payload.unitsAvailable,
          minimumThreshold: payload.minimumThreshold,
          collectionDate: payload.collectionDate,
          expiryDate: payload.expiryDate,
          inventoryStatus: status,
        })
        .returning();

      await tx.insert(inventoryTransactions).values({
        inventoryId: inv.id,
        bloodBankId: inv.bloodBankId,
        transactionType: 'ADD',
        unitsDelta: inv.unitsAvailable,
        unitsAfter: inv.unitsAvailable,
        performedByUserId: req.user?.id ?? null,
        notes: `Added ${inv.unitsAvailable} units of ${inv.bloodGroup} (expires ${inv.expiryDate})`,
      });

      return inv;
    });

    return res.status(201).json({ item: created });
  } catch (error) {
    console.error('Add inventory error:', error);
    return res.status(500).json({ error: 'Failed to add inventory batch.' });
  }
});

apiRouter.patch('/inventory/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const { unitsAvailable, minimumThreshold, expiryDate, notes } = req.body ?? {};

    const existingRows = await db.select().from(bloodInventory).where(eq(bloodInventory.id, id));
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Inventory batch not found.' });
    }
    const existing = existingRows[0];

    if (req.user?.role === 'STAFF' && req.user.bloodBankId !== existing.bloodBankId) {
      return res.status(403).json({ error: 'Staff can only modify their assigned blood bank inventory.' });
    }

    const nextUnits = unitsAvailable !== undefined ? Number(unitsAvailable) : existing.unitsAvailable;
    if (!Number.isInteger(nextUnits) || nextUnits < 0) {
      return res.status(400).json({ error: 'Negative inventory is prohibited. Units must be >= 0.' });
    }

    const nextThreshold =
      minimumThreshold !== undefined ? Number(minimumThreshold) : existing.minimumThreshold;
    if (!Number.isInteger(nextThreshold) || nextThreshold < 0) {
      return res.status(400).json({ error: 'Minimum threshold must be >= 0.' });
    }

    const nextExpiry = expiryDate ? String(expiryDate) : existing.expiryDate;
    if (nextExpiry <= existing.collectionDate) {
      return res.status(400).json({ error: 'Expiry date must be after collection date.' });
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const nextStatus =
      nextExpiry < todayIso
        ? 'Expired'
        : nextUnits === 0
          ? 'Depleted'
          : nextUnits <= nextThreshold
            ? 'Low Stock'
            : 'Available';

    const delta = nextUnits - existing.unitsAvailable;

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(bloodInventory)
        .set({
          unitsAvailable: nextUnits,
          minimumThreshold: nextThreshold,
          expiryDate: nextExpiry,
          inventoryStatus: nextStatus,
          updatedAt: new Date(),
        })
        .where(eq(bloodInventory.id, id))
        .returning();

      await tx.insert(inventoryTransactions).values({
        inventoryId: row.id,
        bloodBankId: row.bloodBankId,
        transactionType: delta > 0 ? 'RESTOCK' : 'ADJUST',
        unitsDelta: delta,
        unitsAfter: row.unitsAvailable,
        performedByUserId: req.user?.id ?? null,
        notes: notes ? String(notes) : `Adjusted stock from ${existing.unitsAvailable} to ${nextUnits} units`,
      });

      if (nextUnits <= nextThreshold && nextExpiry >= todayIso) {
        await tx.insert(notifications).values({
          bloodBankId: row.bloodBankId,
          severity: nextUnits === 0 ? 'Critical' : 'Warning',
          title: `Low Stock Alert — ${row.bloodGroup}`,
          message: `Inventory batch has ${nextUnits} units remaining (threshold: ${nextThreshold}).`,
          isRead: false,
        });
      }

      return row;
    });

    return res.json({ item: updated });
  } catch (error) {
    console.error('Update inventory error:', error);
    return res.status(500).json({ error: 'Failed to update inventory batch.' });
  }
});

apiRouter.delete('/inventory/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const existingRows = await db.select().from(bloodInventory).where(eq(bloodInventory.id, id));
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Inventory batch not found.' });
    }
    const existing = existingRows[0];

    if (req.user?.role === 'STAFF' && req.user.bloodBankId !== existing.bloodBankId) {
      return res.status(403).json({ error: 'Staff can only remove batches from their assigned bank.' });
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    if (existing.unitsAvailable > 0 && existing.expiryDate >= todayIso) {
      return res.status(409).json({
        error: 'Cannot remove active non-expired stock with remaining units. Adjust units to 0 or discard expired stock.',
      });
    }

    await db.delete(bloodInventory).where(eq(bloodInventory.id, id));
    return res.json({ ok: true });
  } catch (error) {
    console.error('Delete inventory error:', error);
    return res.status(500).json({ error: 'Failed to remove inventory batch.' });
  }
});

// ==========================================
// 6. PRIORITY-BASED BLOOD REQUESTS + EMBEDDINGS
// ==========================================
apiRouter.get('/requests', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { priority, status, bloodGroup, search } = req.query;
    const [allRequests, banks, history] = await Promise.all([
      db.select().from(bloodRequests).orderBy(desc(bloodRequests.priorityScore), desc(bloodRequests.requestDate)),
      db.select().from(bloodBanks),
      db.select().from(requestStatusHistory).orderBy(desc(requestStatusHistory.changedAt)),
    ]);

    const bankMap = new Map(banks.map((b) => [b.id, b.name]));
    const historyByRequest = new Map<string, typeof history>();
    for (const h of history) {
      const list = historyByRequest.get(h.requestId) ?? [];
      list.push(h);
      historyByRequest.set(h.requestId, list);
    }

    let items = allRequests.map((r) => ({
      ...r,
      assignedBankName: r.assignedBankId ? bankMap.get(r.assignedBankId) || null : null,
      history: historyByRequest.get(r.id) ?? [],
    }));

    if (priority && priority !== 'ALL') items = items.filter((r) => r.priority === priority);
    if (status && status !== 'ALL') items = items.filter((r) => r.status === status);
    if (bloodGroup && bloodGroup !== 'ALL') items = items.filter((r) => r.requiredBloodGroup === bloodGroup);
    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      items = items.filter(
        (r) =>
          r.requestCode.toLowerCase().includes(q) ||
          r.hospitalName.toLowerCase().includes(q) ||
          r.requestDescription.toLowerCase().includes(q),
      );
    }

    return res.json({ requests: items });
  } catch (error) {
    console.error('List requests error:', error);
    return res.status(500).json({ error: 'Failed to load blood requests.' });
  }
});

apiRouter.post('/requests', requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body ?? {};
    const payload = {
      hospitalName: body.hospitalName,
      hospitalLocation: body.hospitalLocation,
      contactPerson: body.contactPerson,
      contactPhone: body.contactPhone,
      requiredBloodGroup: body.requiredBloodGroup,
      unitsRequired: Number(body.unitsRequired),
      priority: body.priority,
      requestDescription: body.requestDescription,
      requiredByDate: body.requiredByDate,
    };

    const validation = validateBloodRequestInput(payload);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join(' ') });
    }

    const { weights } = await getPolicyAndWeights();
    const todayIso = new Date().toISOString().slice(0, 10);
    const compatibleGroups = getCompatibleDonorGroups(payload.requiredBloodGroup);

    const invRows = await db.select().from(bloodInventory);
    const availableCompatibleUnits = invRows
      .filter(
        (i) =>
          i.expiryDate >= todayIso &&
          i.unitsAvailable > 0 &&
          compatibleGroups.includes(i.bloodGroup as typeof BLOOD_GROUPS[number]),
      )
      .reduce((s, i) => s + i.unitsAvailable, 0);

    const scoreResult = calculatePriorityScore(
      {
        priority: payload.priority as RequestPriority,
        requiredByDate: payload.requiredByDate,
        requestDate: new Date(),
        unitsRequired: payload.unitsRequired,
        availableCompatibleUnits,
      },
      weights,
    );

    const extracted = extractRequestContext(payload.requestDescription);
    const embedding = generateLocalSemanticEmbedding(
      `${payload.requestDescription} ${body.medicalUrgencyNotes || ''} ${payload.requiredBloodGroup} ${payload.priority}`,
    );

    const [{ value: reqCount }] = await db.select({ value: count() }).from(bloodRequests);
    const requestCode = `REQ-${2041 + Number(reqCount) + Math.floor(Math.random() * 50)}`;

    const created = await db.transaction(async (tx) => {
      const [reqRow] = await tx
        .insert(bloodRequests)
        .values({
          requestCode,
          hospitalName: String(payload.hospitalName).trim(),
          hospitalLocation: String(payload.hospitalLocation).trim(),
          latitude: Number(body.latitude) || 1.31,
          longitude: Number(body.longitude) || 103.84,
          contactPerson: String(payload.contactPerson).trim(),
          contactPhone: String(payload.contactPhone).trim(),
          requiredBloodGroup: payload.requiredBloodGroup,
          rhFactor: parseRhFactor(payload.requiredBloodGroup),
          unitsRequired: payload.unitsRequired,
          unitsFulfilled: 0,
          priority: payload.priority,
          priorityScore: scoreResult.score,
          requestDescription: String(payload.requestDescription).trim(),
          medicalUrgencyNotes: String(body.medicalUrgencyNotes || '').trim(),
          extractedContext: extracted as unknown as Record<string, unknown>,
          requiredByDate: payload.requiredByDate,
          status: 'Pending',
          assignedBankId: body.assignedBankId || req.user?.bloodBankId || null,
          createdByUserId: req.user?.id ?? null,
        })
        .returning();

      await tx.insert(requestEmbeddings).values({
        requestId: reqRow.id,
        embeddingModel: 'bloodlink-semantic-v1-128d',
        embedding,
        metadata: {
          priority: reqRow.priority,
          bloodGroup: reqRow.requiredBloodGroup,
          unitsRequired: reqRow.unitsRequired,
          medicalContext: extracted.medicalContext,
        },
      });

      await tx.insert(requestStatusHistory).values({
        requestId: reqRow.id,
        previousStatus: null,
        newStatus: 'Pending',
        previousPriority: null,
        newPriority: reqRow.priority,
        changedByUserId: req.user?.id ?? null,
        notes: `Created (${scoreResult.explanation})`,
      });

      if (reqRow.priority === 'Emergency') {
        await tx.insert(notifications).values({
          bloodBankId: reqRow.assignedBankId,
          severity: 'Critical',
          title: `Emergency Blood Request ${reqRow.requestCode}`,
          message: `${reqRow.hospitalName} needs ${reqRow.unitsRequired} units of ${reqRow.requiredBloodGroup} (Priority score ${reqRow.priorityScore}).`,
          isRead: false,
        });
      }

      return reqRow;
    });

    return res.status(201).json({
      request: created,
      scoreBreakdown: scoreResult,
      extractedContext: extracted,
    });
  } catch (error) {
    console.error('Create blood request error:', error);
    return res.status(500).json({ error: 'Failed to create blood request.' });
  }
});

apiRouter.patch('/requests/:id/priority', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const { priority, notes } = req.body ?? {};
    if (!['Emergency', 'Urgent', 'Routine'].includes(priority)) {
      return res.status(400).json({ error: 'Priority must be Emergency, Urgent, or Routine.' });
    }

    const existingRows = await db.select().from(bloodRequests).where(eq(bloodRequests.id, id));
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Blood request not found.' });
    }
    const existing = existingRows[0];

    const { weights } = await getPolicyAndWeights();
    const scoreResult = calculatePriorityScore(
      {
        priority: priority as RequestPriority,
        requiredByDate: existing.requiredByDate,
        requestDate: existing.requestDate,
        unitsRequired: existing.unitsRequired,
        availableCompatibleUnits: 5,
      },
      weights,
    );

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(bloodRequests)
        .set({
          priority,
          priorityScore: scoreResult.score,
        })
        .where(eq(bloodRequests.id, id))
        .returning();

      await tx.insert(requestStatusHistory).values({
        requestId: id,
        previousStatus: existing.status,
        newStatus: existing.status,
        previousPriority: existing.priority,
        newPriority: priority,
        changedByUserId: req.user?.id ?? null,
        notes: notes ? String(notes) : `Priority escalated/updated from ${existing.priority} to ${priority}`,
      });

      return row;
    });

    return res.json({ request: updated });
  } catch (error) {
    console.error('Update priority error:', error);
    return res.status(500).json({ error: 'Failed to update priority.' });
  }
});

apiRouter.patch('/requests/:id/status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const { status, notes } = req.body ?? {};
    const validStatuses = [
      'Pending',
      'Processing',
      'Matched',
      'Partially Fulfilled',
      'Fulfilled',
      'Rejected',
      'Cancelled',
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid request status.' });
    }

    const existingRows = await db.select().from(bloodRequests).where(eq(bloodRequests.id, id));
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Blood request not found.' });
    }
    const existing = existingRows[0];

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(bloodRequests)
        .set({ status })
        .where(eq(bloodRequests.id, id))
        .returning();

      await tx.insert(requestStatusHistory).values({
        requestId: id,
        previousStatus: existing.status,
        newStatus: status,
        previousPriority: existing.priority,
        newPriority: existing.priority,
        changedByUserId: req.user?.id ?? null,
        notes: notes ? String(notes) : `Status updated from ${existing.status} to ${status}`,
      });

      return row;
    });

    return res.json({ request: updated });
  } catch (error) {
    console.error('Update status error:', error);
    return res.status(500).json({ error: 'Failed to update request status.' });
  }
});

// ==========================================
// 7. SMART MATCHING, PGVECTOR SEMANTIC SEARCH & ATOMIC ALLOCATION
// ==========================================
apiRouter.get('/matching/:requestId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const requestId = String(req.params.requestId);
    const reqRows = await db.select().from(bloodRequests).where(eq(bloodRequests.id, requestId));
    if (reqRows.length === 0) {
      return res.status(404).json({ error: 'Blood request not found.' });
    }
    const request = reqRows[0];

    const [{ policy }, allDonors, allInv, banks] = await Promise.all([
      getPolicyAndWeights(),
      db.select().from(donors),
      db.select().from(bloodInventory),
      db.select().from(bloodBanks),
    ]);

    const bankMap = new Map(banks.map((b) => [b.id, b]));
    const isAdmin = req.user?.role === 'ADMIN';

    const matchableInventory = allInv.map((i) => {
      const bank = bankMap.get(i.bloodBankId);
      return {
        id: i.id,
        bloodBankId: i.bloodBankId,
        bankName: bank?.name || 'Unknown Bank',
        bankCity: bank?.city || '',
        bankLatitude: bank?.latitude || 0,
        bankLongitude: bank?.longitude || 0,
        operatingStatus: bank?.operatingStatus || 'Active',
        bloodGroup: i.bloodGroup,
        unitsAvailable: i.unitsAvailable,
        minimumThreshold: i.minimumThreshold,
        expiryDate: i.expiryDate,
      };
    });

    const matches = matchDonorsAndInventory(
      request,
      allDonors,
      matchableInventory,
      policy,
    );

    // Mask donor names partially if staff doesn't belong to donor's bank? Keep code + first name or full name for authorized clinical matching, mask raw PII outside bank
    const maskMatchDonor = (m: (typeof matches.compatibleDonors)[number]) => {
      const donorRecord = allDonors.find((d) => d.id === m.donorId);
      const allowed =
        isAdmin ||
        (req.user?.bloodBankId && donorRecord?.associatedBankId === req.user.bloodBankId);
      return {
        ...m,
        phoneNumber: allowed ? donorRecord?.phoneNumber : maskPhone(donorRecord?.phoneNumber || ''),
        privacyMasked: !allowed,
      };
    };

    // Query pgvector for semantically similar requests using cosine distance (<=>)
    const embeddingRows = await db
      .select()
      .from(requestEmbeddings)
      .where(eq(requestEmbeddings.requestId, requestId));

    let similarRequests: Array<{
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
    }> = [];

    if (embeddingRows.length > 0) {
      const vecLiteral = `[${embeddingRows[0].embedding.join(',')}]`;
      const simResult = await db.execute(sql`
        SELECT
          br.id,
          br.request_code,
          br.hospital_name,
          br.required_blood_group,
          br.units_required,
          br.priority,
          br.status,
          br.request_description,
          1 - (re.embedding <=> ${vecLiteral}::vector) AS similarity
        FROM request_embeddings re
        INNER JOIN blood_requests br ON br.id = re.request_id
        WHERE br.id <> ${requestId}::uuid
        ORDER BY re.embedding <=> ${vecLiteral}::vector ASC
        LIMIT 4
      `);

      similarRequests = (simResult.rows as Array<Record<string, unknown>>).map((row) => {
        const sim = Math.round(Number(row.similarity || 0) * 1000) / 1000;
        const descText = String(row.request_description || '');
        return {
          id: String(row.id),
          requestCode: String(row.request_code),
          hospitalName: String(row.hospital_name),
          requiredBloodGroup: String(row.required_blood_group),
          unitsRequired: Number(row.units_required),
          priority: String(row.priority),
          status: String(row.status),
          requestDescription: descText,
          similarity: sim,
          explanation: explainSemanticRetrieval(
            request.requestDescription,
            descText,
            sim,
          ),
        };
      });
    }

    const { weights } = await getPolicyAndWeights();
    const totalCompatibleUnits = matches.compatibleBanks.reduce(
      (s, b) => s + b.unitsAvailable,
      0,
    );
    const priorityDetails = calculatePriorityScore(
      {
        priority: request.priority as RequestPriority,
        requiredByDate: request.requiredByDate,
        requestDate: request.requestDate,
        unitsRequired: request.unitsRequired,
        availableCompatibleUnits: totalCompatibleUnits,
      },
      weights,
    );

    return res.json({
      request,
      priorityDetails,
      screeningPolicy: policy,
      compatibleGroups: getCompatibleDonorGroups(
        request.requiredBloodGroup as typeof BLOOD_GROUPS[number],
      ),
      compatibleDonors: matches.compatibleDonors.map(maskMatchDonor),
      ineligibleDonors: matches.ineligibleDonors.map(maskMatchDonor),
      compatibleBanks: matches.compatibleBanks,
      excludedBanks: matches.excludedBanks,
      similarRequests,
    });
  } catch (error) {
    console.error('Matching error:', error);
    return res.status(500).json({ error: 'Failed to compute donor and bank matches.' });
  }
});

apiRouter.post('/matching/:requestId/allocate', requireAuth, async (req: AuthRequest, res) => {
  try {
    const requestId = String(req.params.requestId);
    const { inventoryId, unitsToAllocate, donorId } = req.body ?? {};
    const units = Number(unitsToAllocate);

    if (!inventoryId || !Number.isInteger(units) || units <= 0) {
      return res.status(400).json({ error: 'Valid inventory batch and positive integer unitsToAllocate are required.' });
    }

    const allocationResult = await db.transaction(async (tx) => {
      const reqRows = await tx
        .select()
        .from(bloodRequests)
        .where(eq(bloodRequests.id, requestId));
      if (reqRows.length === 0) {
        throw new Error('STATUS:404:Blood request not found.');
      }
      const reqRecord = reqRows[0];
      if (['Fulfilled', 'Cancelled', 'Rejected'].includes(reqRecord.status)) {
        throw new Error(`STATUS:409:Request is already ${reqRecord.status} and cannot receive allocations.`);
      }

      const invRows = await tx
        .select()
        .from(bloodInventory)
        .where(eq(bloodInventory.id, String(inventoryId)));
      if (invRows.length === 0) {
        throw new Error('STATUS:404:Inventory batch not found.');
      }
      const invRecord = invRows[0];

      if (req.user?.role === 'STAFF' && req.user.bloodBankId !== invRecord.bloodBankId) {
        throw new Error('STATUS:403:Staff can only allocate blood stock from their assigned blood bank.');
      }

      if (isBatchExpired(invRecord.expiryDate)) {
        throw new Error(`STATUS:400:Safety block: Batch expired on ${invRecord.expiryDate} and cannot be allocated.`);
      }

      const compatibleGroups = getCompatibleDonorGroups(
        reqRecord.requiredBloodGroup as typeof BLOOD_GROUPS[number],
      );
      if (!compatibleGroups.includes(invRecord.bloodGroup as typeof BLOOD_GROUPS[number])) {
        throw new Error(
          `STATUS:400:Compatibility block: ${invRecord.bloodGroup} cannot be allocated to ${reqRecord.requiredBloodGroup} recipient.`,
        );
      }

      if (invRecord.unitsAvailable < units) {
        throw new Error(
          `STATUS:409:Insufficient units in batch (${invRecord.unitsAvailable} available, ${units} requested). Transaction rolled back.`,
        );
      }

      const nextUnitsAvailable = invRecord.unitsAvailable - units;
      const nextInvStatus =
        nextUnitsAvailable === 0
          ? 'Depleted'
          : nextUnitsAvailable <= invRecord.minimumThreshold
            ? 'Low Stock'
            : 'Available';

      const [updatedInv] = await tx
        .update(bloodInventory)
        .set({
          unitsAvailable: nextUnitsAvailable,
          inventoryStatus: nextInvStatus,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(bloodInventory.id, invRecord.id),
            gte(bloodInventory.unitsAvailable, units),
          ),
        )
        .returning();

      if (!updatedInv) {
        throw new Error('STATUS:409:Concurrent stock modification detected. Transaction rolled back.');
      }

      const nextFulfilled = reqRecord.unitsFulfilled + units;
      const nextReqStatus =
        nextFulfilled >= reqRecord.unitsRequired ? 'Fulfilled' : 'Partially Fulfilled';

      const [updatedReq] = await tx
        .update(bloodRequests)
        .set({
          unitsFulfilled: nextFulfilled,
          status: nextReqStatus,
          assignedBankId: invRecord.bloodBankId,
        })
        .where(eq(bloodRequests.id, reqRecord.id))
        .returning();

      await tx.insert(inventoryTransactions).values({
        inventoryId: invRecord.id,
        bloodBankId: invRecord.bloodBankId,
        requestId: reqRecord.id,
        transactionType: 'ALLOCATE',
        unitsDelta: -units,
        unitsAfter: nextUnitsAvailable,
        performedByUserId: req.user?.id ?? null,
        notes: `Allocated ${units} units of ${invRecord.bloodGroup} to ${reqRecord.requestCode} (${reqRecord.hospitalName})`,
      });

      await tx.insert(donorMatches).values({
        requestId: reqRecord.id,
        donorId: donorId || null,
        bloodBankId: invRecord.bloodBankId,
        matchType: 'BLOOD_BANK',
        matchScore: 100,
        explanation: `Authorized personnel allocated ${units} units of compatible ${invRecord.bloodGroup} blood.`,
        status: 'Allocated',
      });

      await tx.insert(requestStatusHistory).values({
        requestId: reqRecord.id,
        previousStatus: reqRecord.status,
        newStatus: nextReqStatus,
        previousPriority: reqRecord.priority,
        newPriority: reqRecord.priority,
        changedByUserId: req.user?.id ?? null,
        notes: `Atomic allocation: -${units} units (${invRecord.bloodGroup}), fulfilled ${nextFulfilled}/${reqRecord.unitsRequired}`,
      });

      if (nextUnitsAvailable <= invRecord.minimumThreshold) {
        await tx.insert(notifications).values({
          bloodBankId: invRecord.bloodBankId,
          severity: nextUnitsAvailable === 0 ? 'Critical' : 'Warning',
          title: `Post-Allocation Low Stock — ${invRecord.bloodGroup}`,
          message: `Batch dropped to ${nextUnitsAvailable} units (threshold ${invRecord.minimumThreshold}) after allocation to ${reqRecord.requestCode}.`,
          isRead: false,
        });
      }

      return { updatedReq, updatedInv };
    });

    return res.json({
      message: 'Blood units allocated atomically.',
      request: allocationResult.updatedReq,
      inventory: allocationResult.updatedInv,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Allocation failed.';
    if (msg.startsWith('STATUS:')) {
      const [, codeStr, ...rest] = msg.split(':');
      return res.status(Number(codeStr)).json({ error: rest.join(':') });
    }
    console.error('Allocation transaction error:', error);
    return res.status(500).json({ error: 'Allocation transaction rolled back due to an internal error.' });
  }
});

// ==========================================
// 8. SEMANTIC SEARCH USING PGVECTOR
// ==========================================
apiRouter.post('/semantic-search', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { query } = req.body ?? {};
    if (!query || String(query).trim().length < 3) {
      return res.status(400).json({ error: 'Search query must be at least 3 characters.' });
    }

    const queryText = String(query).trim();
    const extracted = extractRequestContext(queryText);
    const queryVector = generateLocalSemanticEmbedding(queryText);
    const vecLiteral = `[${queryVector.join(',')}]`;

    const result = await db.execute(sql`
      SELECT
        br.id,
        br.request_code,
        br.hospital_name,
        br.hospital_location,
        br.required_blood_group,
        br.units_required,
        br.priority,
        br.priority_score,
        br.status,
        br.request_description,
        1 - (re.embedding <=> ${vecLiteral}::vector) AS similarity
      FROM request_embeddings re
      INNER JOIN blood_requests br ON br.id = re.request_id
      ORDER BY re.embedding <=> ${vecLiteral}::vector ASC
      LIMIT 6
    `);

    const matches = (result.rows as Array<Record<string, unknown>>).map((row) => {
      const sim = Math.round(Number(row.similarity || 0) * 1000) / 1000;
      const descText = String(row.request_description || '');
      return {
        id: String(row.id),
        requestCode: String(row.request_code),
        hospitalName: String(row.hospital_name),
        hospitalLocation: String(row.hospital_location),
        requiredBloodGroup: String(row.required_blood_group),
        unitsRequired: Number(row.units_required),
        priority: String(row.priority),
        priorityScore: Number(row.priority_score),
        status: String(row.status),
        requestDescription: descText,
        similarity: sim,
        explanation: explainSemanticRetrieval(queryText, descText, sim),
      };
    });

    return res.json({
      query: queryText,
      extractedContext: extracted,
      matches,
      safetyNotice:
        'Semantic similarity assists request understanding and triage only; blood group compatibility, inventory expiry, and staff verification govern all allocations.',
    });
  } catch (error) {
    console.error('Semantic search error:', error);
    return res.status(500).json({ error: 'Semantic vector search failed.' });
  }
});

// ==========================================
// 9. ANALYTICS & REPORTS
// ==========================================
apiRouter.get('/analytics', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const todayIso = new Date().toISOString().slice(0, 10);
    const [banks, allDonors, allInventory, allRequests] = await Promise.all([
      db.select().from(bloodBanks).orderBy(bloodBanks.bankCode),
      db.select().from(donors).where(eq(donors.isActive, true)),
      db.select().from(bloodInventory),
      db.select().from(bloodRequests).orderBy(bloodRequests.requestDate),
    ]);

    const validInv = allInventory.filter((i) => i.expiryDate >= todayIso);

    const unitsByGroup = BLOOD_GROUPS.map((bg) => ({
      bloodGroup: bg,
      availableUnits: validInv
        .filter((i) => i.bloodGroup === bg)
        .reduce((s, i) => s + i.unitsAvailable, 0),
      requestedUnits: allRequests
        .filter((r) => r.requiredBloodGroup === bg && r.status !== 'Cancelled')
        .reduce((s, r) => s + r.unitsRequired, 0),
    }));

    const inventoryByBank = banks.map((bank) => {
      const bankInv = validInv.filter((i) => i.bloodBankId === bank.id);
      return {
        bankName: bank.name.replace(' Blood Bank', '').replace(' Blood Center', ''),
        fullName: bank.name,
        availableUnits: bankInv.reduce((s, i) => s + i.unitsAvailable, 0),
        lowStockBatches: bankInv.filter((i) => i.unitsAvailable <= i.minimumThreshold).length,
      };
    });

    const requestSummary = {
      emergency: allRequests.filter((r) => r.priority === 'Emergency').length,
      urgent: allRequests.filter((r) => r.priority === 'Urgent').length,
      routine: allRequests.filter((r) => r.priority === 'Routine').length,
      fulfilled: allRequests.filter((r) => r.status === 'Fulfilled').length,
      pending: allRequests.filter((r) => ['Pending', 'Processing', 'Partially Fulfilled'].includes(r.status)).length,
      matched: allRequests.filter((r) => r.status === 'Matched').length,
    };

    const donorStats = BLOOD_GROUPS.map((bg) => ({
      bloodGroup: bg,
      total: allDonors.filter((d) => d.bloodGroup === bg).length,
      available: allDonors.filter((d) => d.bloodGroup === bg && d.availabilityStatus === 'Available').length,
    }));

    // Build real request trends grouped by day/month from DB records
    const trendBuckets = new Map<string, { period: string; Emergency: number; Urgent: number; Routine: number; units: number }>();
    for (const r of allRequests) {
      const d = new Date(r.requestDate);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const bucket = trendBuckets.get(label) ?? { period: label, Emergency: 0, Urgent: 0, Routine: 0, units: 0 };
      if (r.priority === 'Emergency') bucket.Emergency += 1;
      else if (r.priority === 'Urgent') bucket.Urgent += 1;
      else bucket.Routine += 1;
      bucket.units += r.unitsRequired;
      trendBuckets.set(label, bucket);
    }

    const lowStockReport = validInv
      .filter((i) => i.unitsAvailable <= i.minimumThreshold)
      .map((i) => ({
        id: i.id,
        bankName: banks.find((b) => b.id === i.bloodBankId)?.name || 'Unknown',
        bloodGroup: i.bloodGroup,
        unitsAvailable: i.unitsAvailable,
        minimumThreshold: i.minimumThreshold,
        deficit: Math.max(0, i.minimumThreshold - i.unitsAvailable),
      }));

    return res.json({
      unitsByGroup,
      inventoryByBank,
      requestSummary,
      donorStats,
      requestTrends: Array.from(trendBuckets.values()),
      lowStockReport,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return res.status(500).json({ error: 'Failed to generate analytics report.' });
  }
});

// ==========================================
// 10. NOTIFICATIONS, SETTINGS & DBMS SQL DEMO
// ==========================================
apiRouter.get('/notifications', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const items = await db
      .select()
      .from(notifications)
      .orderBy(desc(notifications.createdAt))
      .limit(20);
    return res.json({ notifications: items });
  } catch (error) {
    console.error('Notifications error:', error);
    return res.status(500).json({ error: 'Failed to load notifications.' });
  }
});

apiRouter.patch('/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [updated] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, String(req.params.id)))
      .returning();
    return res.json({ notification: updated });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return res.status(500).json({ error: 'Failed to update notification.' });
  }
});

apiRouter.post('/notifications/mark-all-read', requireAuth, async (_req: AuthRequest, res) => {
  try {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.isRead, false));
    return res.json({ ok: true });
  } catch (error) {
    console.error('Mark all read error:', error);
    return res.status(500).json({ error: 'Failed to mark notifications read.' });
  }
});

apiRouter.get('/settings', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { settingsRow } = await getPolicyAndWeights();
    let staffUsers: Array<{
      id: string;
      email: string;
      fullName: string;
      role: string;
      bloodBankId: string | null;
      isActive: boolean;
    }> = [];

    if (req.user?.role === 'ADMIN') {
      staffUsers = await db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          role: users.role,
          bloodBankId: users.bloodBankId,
          isActive: users.isActive,
        })
        .from(users)
        .orderBy(users.role, users.fullName);
    }

    return res.json({ settings: settingsRow, staffUsers });
  } catch (error) {
    console.error('Load settings error:', error);
    return res.status(500).json({ error: 'Failed to load settings.' });
  }
});

apiRouter.patch('/settings', requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
  try {
    const {
      minDonationIntervalDays,
      minDonorAge,
      maxDonorAge,
      defaultLowStockThreshold,
      emergencyWeight,
      urgentWeight,
      routineWeight,
    } = req.body ?? {};

    const [updated] = await db
      .update(systemSettings)
      .set({
        minDonationIntervalDays: Math.max(14, Number(minDonationIntervalDays) || 56),
        minDonorAge: Math.max(16, Number(minDonorAge) || 18),
        maxDonorAge: Math.min(80, Number(maxDonorAge) || 65),
        defaultLowStockThreshold: Math.max(1, Number(defaultLowStockThreshold) || 6),
        emergencyWeight: Math.max(50, Number(emergencyWeight) || 100),
        urgentWeight: Math.max(20, Number(urgentWeight) || 60),
        routineWeight: Math.max(5, Number(routineWeight) || 20),
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.id, 'default'))
      .returning();

    return res.json({ settings: updated });
  } catch (error) {
    console.error('Update settings error:', error);
    return res.status(500).json({ error: 'Failed to update policy settings.' });
  }
});

apiRouter.post('/settings/users', requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
  try {
    const { fullName, email, password, role, bloodBankId } = req.body ?? {};
    if (!fullName?.trim() || !isValidEmail(String(email || '')) || !password || String(password).length < 6) {
      return res.status(400).json({ error: 'Full name, valid email, and password (min 6 chars) are required.' });
    }
    const validRole: UserRole = role === 'ADMIN' ? 'ADMIN' : 'STAFF';
    const passwordHash = await bcrypt.hash(String(password), 10);

    const [created] = await db
      .insert(users)
      .values({
        email: String(email).trim().toLowerCase(),
        passwordHash,
        fullName: String(fullName).trim(),
        role: validRole,
        bloodBankId: validRole === 'STAFF' ? bloodBankId || null : null,
        isActive: true,
      })
      .returning({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        bloodBankId: users.bloodBankId,
        isActive: users.isActive,
      });

    return res.status(201).json({ user: created });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('unique')) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    console.error('Create user error:', error);
    return res.status(500).json({ error: 'Failed to create staff account.' });
  }
});

apiRouter.post('/settings/sql-demo', requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
  try {
    const { demoKey } = req.body ?? {};
    const demos: Record<string, { title: string; concept: string; query: string }> = {
      join_group_having: {
        title: 'Multi-Bank Stock Aggregation (JOIN + GROUP BY + HAVING)',
        concept: 'Relational Joins, Aggregate SUM, and HAVING Low-Stock Filter',
        query: `SELECT bb.bank_code, bb.name AS blood_bank, bi.blood_group, SUM(bi.units_available) AS total_units
FROM blood_inventory bi
JOIN blood_banks bb ON bb.id = bi.blood_bank_id
WHERE bi.expiry_date >= CURRENT_DATE::text
GROUP BY bb.bank_code, bb.name, bi.blood_group
HAVING SUM(bi.units_available) <= 8
ORDER BY total_units ASC`,
      },
      subquery_priority: {
        title: 'Above-Average Priority Requests (Subquery + ORDER BY)',
        concept: 'Scalar Subquery Comparison & Composite Priority Ranking',
        query: `SELECT request_code, hospital_name, required_blood_group, priority, priority_score, status
FROM blood_requests
WHERE priority_score >= (SELECT AVG(priority_score) FROM blood_requests)
ORDER BY priority_score DESC`,
      },
      pgvector_similarity: {
        title: 'pgvector Cosine Similarity Matrix (Vector Distance <=>)',
        concept: 'pgvector 128-D Cosine Similarity Self-Join on Request Embeddings',
        query: `SELECT a.request_code AS source_req, b.request_code AS related_req, b.priority,
       ROUND((1 - (ea.embedding <=> eb.embedding))::numeric, 4) AS cosine_similarity
FROM request_embeddings ea
JOIN blood_requests a ON a.id = ea.request_id
JOIN request_embeddings eb ON ea.request_id < eb.request_id
JOIN blood_requests b ON b.id = eb.request_id
ORDER BY cosine_similarity DESC
LIMIT 6`,
      },
      audit_trail_join: {
        title: 'Transactional Inventory & Request Audit Trail (Multi-Table JOIN)',
        concept: 'ACID Transaction Ledger across Inventory, Banks & Requests',
        query: `SELECT it.transaction_type, bb.name AS blood_bank, it.units_delta, it.units_after,
       COALESCE(br.request_code, 'DIRECT') AS request_ref, it.notes
FROM inventory_transactions it
JOIN blood_banks bb ON bb.id = it.blood_bank_id
LEFT JOIN blood_requests br ON br.id = it.request_id
ORDER BY it.created_at DESC
LIMIT 8`,
      },
      schema_metadata: {
        title: 'Database Constraints, Indexes & pgvector Extension Audit',
        concept: 'System Catalog Proof of CHECK/FK/UNIQUE Constraints & B-Tree Indexes',
        query: `SELECT tc.table_name, tc.constraint_type, tc.constraint_name
FROM information_schema.table_constraints tc
WHERE tc.table_schema = 'public'
  AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK')
ORDER BY tc.table_name, tc.constraint_type
LIMIT 15`,
      },
    };

    const selected = demos[String(demoKey)];
    if (!selected) {
      return res.status(400).json({ error: 'Unknown SQL demonstration key.' });
    }

    const result = await db.execute(sql.raw(selected.query));
    return res.json({
      title: selected.title,
      concept: selected.concept,
      sql: selected.query,
      rows: result.rows,
    });
  } catch (error) {
    console.error('SQL demo error:', error);
    return res.status(500).json({ error: 'Failed to run SQL demonstration query.' });
  }
});
