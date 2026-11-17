import { isValidBloodGroup } from './blood-compatibility.ts';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/[\s\-()+]/g, '');
  return digits.length >= 7 && digits.length <= 15 && /^\d+$/.test(digits);
}

export function validateDonorInput(input: {
  fullName?: string;
  dateOfBirth?: string;
  bloodGroup?: string;
  phoneNumber?: string;
  email?: string;
  city?: string;
  address?: string;
}): ValidationResult {
  const errors: string[] = [];
  if (!input.fullName?.trim()) errors.push('Full name is required.');
  if (!input.dateOfBirth?.trim() || Number.isNaN(Date.parse(input.dateOfBirth))) {
    errors.push('Valid date of birth is required (YYYY-MM-DD).');
  }
  if (!input.bloodGroup || !isValidBloodGroup(input.bloodGroup)) {
    errors.push('Valid ABO/Rh blood group is required.');
  }
  if (!input.phoneNumber || !isValidPhone(input.phoneNumber)) {
    errors.push('Valid phone number (7-15 digits) is required.');
  }
  if (!input.email || !isValidEmail(input.email)) {
    errors.push('Valid email address is required.');
  }
  if (!input.city?.trim()) errors.push('City is required.');
  if (!input.address?.trim()) errors.push('Address is required.');

  return { valid: errors.length === 0, errors };
}

export function validateInventoryInput(input: {
  bloodBankId?: string;
  bloodGroup?: string;
  unitsAvailable?: number;
  minimumThreshold?: number;
  collectionDate?: string;
  expiryDate?: string;
}): ValidationResult {
  const errors: string[] = [];
  if (!input.bloodBankId?.trim()) errors.push('Blood bank is required.');
  if (!input.bloodGroup || !isValidBloodGroup(input.bloodGroup)) {
    errors.push('Valid blood group is required.');
  }
  if (
    typeof input.unitsAvailable !== 'number' ||
    !Number.isInteger(input.unitsAvailable) ||
    input.unitsAvailable < 0
  ) {
    errors.push('Units available must be a non-negative integer.');
  }
  if (
    input.minimumThreshold !== undefined &&
    (typeof input.minimumThreshold !== 'number' ||
      !Number.isInteger(input.minimumThreshold) ||
      input.minimumThreshold < 0)
  ) {
    errors.push('Minimum threshold must be a non-negative integer.');
  }
  if (!input.collectionDate || Number.isNaN(Date.parse(input.collectionDate))) {
    errors.push('Valid collection date is required.');
  }
  if (!input.expiryDate || Number.isNaN(Date.parse(input.expiryDate))) {
    errors.push('Valid expiry date is required.');
  }
  if (
    input.collectionDate &&
    input.expiryDate &&
    input.expiryDate <= input.collectionDate
  ) {
    errors.push('Expiry date must be after collection date.');
  }
  return { valid: errors.length === 0, errors };
}

export function validateBloodRequestInput(input: {
  hospitalName?: string;
  hospitalLocation?: string;
  contactPerson?: string;
  contactPhone?: string;
  requiredBloodGroup?: string;
  unitsRequired?: number;
  priority?: string;
  requestDescription?: string;
  requiredByDate?: string;
}): ValidationResult {
  const errors: string[] = [];
  if (!input.hospitalName?.trim()) errors.push('Hospital name is required.');
  if (!input.hospitalLocation?.trim()) errors.push('Hospital location is required.');
  if (!input.contactPerson?.trim()) errors.push('Contact person is required.');
  if (!input.contactPhone || !isValidPhone(input.contactPhone)) {
    errors.push('Valid contact phone number is required.');
  }
  if (!input.requiredBloodGroup || !isValidBloodGroup(input.requiredBloodGroup)) {
    errors.push('Valid required blood group is required.');
  }
  if (
    typeof input.unitsRequired !== 'number' ||
    !Number.isInteger(input.unitsRequired) ||
    input.unitsRequired <= 0
  ) {
    errors.push('Units required must be a positive integer.');
  }
  if (!['Emergency', 'Urgent', 'Routine'].includes(input.priority ?? '')) {
    errors.push('Priority must be Emergency, Urgent, or Routine.');
  }
  if (!input.requestDescription?.trim() || input.requestDescription.trim().length < 8) {
    errors.push('Request description must be at least 8 characters.');
  }
  if (!input.requiredByDate || Number.isNaN(Date.parse(input.requiredByDate))) {
    errors.push('Valid required-by date is required.');
  }
  return { valid: errors.length === 0, errors };
}
