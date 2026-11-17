export type UserRole = 'ADMIN' | 'STAFF';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  bloodBankId: string | null;
  bloodBankName?: string | null;
}

export interface DashboardData {
  stats: {
    totalBloodBanks: number;
    activeBloodBanks: number;
    registeredDonors: number;
    availableDonors: number;
    pendingRequests: number;
    emergencyPending: number;
    availableBloodUnits: number;
    lowStockCount: number;
  };
  inventoryByGroup: Array<{ bloodGroup: string; units: number }>;
  urgencyDistribution: Array<{ name: string; value: number; color: string }>;
  recentRequests: Array<{
    id: string;
    requestCode: string;
    hospitalName: string;
    requiredBloodGroup: string;
    unitsRequired: number;
    unitsFulfilled: number;
    priority: 'Emergency' | 'Urgent' | 'Routine';
    priorityScore: number;
    status: string;
    requestDate: string;
  }>;
  lowStockAlerts: Array<{
    id: string;
    bloodGroup: string;
    bankId: string;
    bankName: string;
    unitsAvailable: number;
    minimumThreshold: number;
    alertStatus: string;
  }>;
  unreadNotificationsCount: number;
}

export interface BloodBankItem {
  id: string;
  bankCode: string;
  name: string;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
  contactNumber: string;
  email: string;
  operatingStatus: 'Active' | 'Limited' | 'Closed';
  totalUnits: number;
  availableBloodGroups: string[];
  lowStockBatches: number;
}

export interface DonorItem {
  id: string;
  donorCode: string;
  fullName: string;
  dateOfBirth: string;
  bloodGroup: string;
  rhFactor: string;
  phoneNumber: string;
  email: string;
  city: string;
  address: string;
  lastDonationDate: string | null;
  availabilityStatus: 'Available' | 'Unavailable' | 'Deferred';
  associatedBankId: string | null;
  associatedBankName: string | null;
  privacyMasked?: boolean;
  registeredAt: string;
}

export interface InventoryItem {
  id: string;
  bloodBankId: string;
  bankName: string;
  bankCity: string;
  bloodGroup: string;
  rhFactor: string;
  unitsAvailable: number;
  minimumThreshold: number;
  collectionDate: string;
  expiryDate: string;
  inventoryStatus: 'Available' | 'Low Stock' | 'Expired' | 'Depleted';
  isExpired: boolean;
  updatedAt: string;
}

export interface InventoryTransactionItem {
  id: string;
  inventoryId: string;
  bloodBankId: string;
  bankName: string;
  requestId: string | null;
  transactionType: string;
  unitsDelta: number;
  unitsAfter: number;
  notes: string;
  createdAt: string;
}

export interface RequestHistoryItem {
  id: string;
  previousStatus: string | null;
  newStatus: string;
  previousPriority: string | null;
  newPriority: string | null;
  notes: string;
  changedAt: string;
}

export interface BloodRequestItem {
  id: string;
  requestCode: string;
  hospitalName: string;
  hospitalLocation: string;
  contactPerson: string;
  contactPhone: string;
  requiredBloodGroup: string;
  rhFactor: string;
  unitsRequired: number;
  unitsFulfilled: number;
  priority: 'Emergency' | 'Urgent' | 'Routine';
  priorityScore: number;
  requestDescription: string;
  medicalUrgencyNotes: string;
  extractedContext?: {
    urgencyIndicators?: string[];
    suggestedPriority?: string;
    detectedBloodGroup?: string | null;
    detectedUnits?: number | null;
    medicalContext?: string[];
    timeSensitivity?: string;
  };
  requestDate: string;
  requiredByDate: string;
  status: string;
  assignedBankId: string | null;
  assignedBankName: string | null;
  history: RequestHistoryItem[];
}

export interface NotificationItem {
  id: string;
  severity: 'Critical' | 'Warning' | 'Info';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}
