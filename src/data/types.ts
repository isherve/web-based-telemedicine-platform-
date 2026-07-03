// Shared domain models (data layer). These mirror the DB tables but use
// camelCase for the client. The backend maps snake_case rows to these shapes.

export type CareStatus = 'pending_payment' | 'in_process' | 'complete';
export type Language = 'en' | 'rw' | 'fr';
export type Role = 'patient' | 'doctor' | 'finance' | 'pharmacy' | 'admin';

export type Urgency = 'low' | 'medium' | 'high';
export type PaymentProvider = 'momo' | 'airtel';

export interface Profile {
  id: string;
  phoneNumber: string | null;
  email: string | null;
  fullName: string | null;
  isDoctor: boolean;
  role: Role;
  clinicName: string | null;
  consultationFee: number | null;
  momoNumber: string | null;
  avatarUrl: string | null;
  allergies: string | null;
  chronicConditions: string | null;
  aiConsent: boolean;
  insuranceProvider: string | null;
  insuranceNumber: string | null;
  insuranceScheme: string | null;
  createdAt: string;
}

export interface Vital {
  id: string;
  patientId: string;
  consultationId: string | null;
  recordedBy: string;
  systolic: number | null;
  diastolic: number | null;
  heartRate: number | null;
  temperature: number | null;
  weight: number | null;
  bloodSugar: number | null;
  spo2: number | null;
  note: string | null;
  createdAt: string;
  recordedByName?: string | null;
}

export interface RxItem {
  id?: string;
  medicineId?: string | null;
  medicineName: string;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  quantity?: number;
  instructions?: string | null;
  dispensed?: boolean;
}

export interface EPrescription {
  id: string;
  consultationId: string | null;
  patientId: string;
  doctorId: string;
  status: 'active' | 'dispensed' | 'cancelled';
  note: string | null;
  createdAt: string;
  patientName?: string | null;
  doctorName?: string | null;
  items: RxItem[];
}

export interface LabOrder {
  id: string;
  consultationId: string | null;
  patientId: string;
  doctorId: string;
  testName: string;
  status: 'ordered' | 'completed' | 'cancelled';
  result: string | null;
  resultAt: string | null;
  note: string | null;
  createdAt: string;
  patientName?: string | null;
}

export interface Reminder {
  id: string;
  userId: string;
  title: string;
  body: string | null;
  kind: string;
  dueAt: string;
  sent: boolean;
  createdAt: string;
}

export interface AdminStats {
  users: { total: number; patients: number; doctors: number; finance: number; pharmacy: number };
  consultations: { total: number; pending: number; inProgress: number; completed: number; urgent: number };
  revenue: number;
  prescriptions: number;
  labOrders: number;
  medicines: number;
  lowStock: number;
}

export interface AdminUser {
  id: string;
  fullName: string | null;
  email: string | null;
  phoneNumber: string | null;
  role: Role;
  isDoctor: boolean;
  clinicName: string | null;
  createdAt: string;
}

export interface DoctorLeaderboardEntry {
  id: string;
  name: string | null;
  consultations: number;
  completed: number;
  revenue: number;
  avgRating: number | null;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string | null;
  entity: string | null;
  entityId: string | null;
  createdAt: string;
}

export interface Medicine {
  id: string;
  name: string;
  form: string | null;
  quantity: number;
  reorderLevel: number;
  unitPrice: number;
  createdAt: string;
  low: boolean;
}

export interface Dispense {
  id: string;
  medicineId: string;
  consultationId: string | null;
  patientId: string | null;
  dispensedBy: string;
  quantity: number;
  unitPrice: number;
  note: string | null;
  createdAt: string;
  medicineName?: string | null;
  patientName?: string | null;
}

export interface Prescription {
  id: string;
  consultationId: string;
  patientId: string;
  patientName: string | null;
  createdAt: string;
}

export interface FinancialReport {
  generatedAt: string;
  todayIncome: number;
  monthIncome: number;
  totalIncome: number;
  pharmacyRevenue: number;
  totalConsultations: number;
  paidConsultations: number;
  pendingConsultations: number;
  byDay: { date: string; income: number; count: number }[];
  recent: { date: string; patientName: string; amount: number; txn: string }[];
}

export interface PharmacyReport {
  generatedAt: string;
  medicineCount: number;
  stockValue: number;
  totalDispensed: number;
  lowStockCount: number;
  medicines: { name: string; form: string | null; quantity: number; reorderLevel: number; unitPrice: number; low: boolean }[];
  lowStock: { name: string; quantity: number; reorderLevel: number }[];
  dispenses: { date: string; medicineName: string; quantity: number; unitPrice: number; patientName: string | null }[];
}

export interface AuthResult {
  profile: Profile;
  sessionToken: string;
}

export interface Consultation {
  id: string;
  patientId: string | null;
  doctorId: string | null;
  status: CareStatus;
  biologicalSex: string | null;
  severity: string | null;
  duration: string | null;
  symptomCategory: string | null;
  symptomDescription: string | null;
  aiBriefSummary: string | null;
  aiSuggestions: string | null;
  language: Language;
  consultationFee: number | null;
  momoTransactionId: string | null;
  paymentAmount: number | null;
  paymentProvider: PaymentProvider | null;
  urgency: Urgency;
  urgencyScore: number;
  paid: boolean;
  closedAt: string | null;
  createdAt: string;
  patientName?: string | null;
  patientPhone?: string | null;
  patientAllergies?: string | null;
  patientChronic?: string | null;
}

export type MessageType = 'text' | 'photo' | 'voice';

export interface Message {
  id: string;
  consultationId: string;
  senderId: string;
  messageType: MessageType;
  content: string | null;
  createdAt: string;
  // client-only: optimistic send bookkeeping
  pending?: boolean;
  failed?: boolean;
}

export interface DoctorSchedule {
  id: string;
  doctorId: string;
  dayOfWeek: number; // 1 = Monday ... 7 = Sunday
  openTime: string | null;
  closeTime: string | null;
  isAvailable: boolean;
  slotDurationMinutes: number;
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'declined' | 'completed';

export interface Appointment {
  id: string;
  patientId: string | null;
  doctorId: string | null;
  consultationId: string | null;
  requestedDate: string | null;
  status: AppointmentStatus;
  notes: string | null;
  createdAt: string;
  patientName?: string | null;
}

export interface ClinicalDocument {
  id: string;
  consultationId: string;
  patientId: string;
  documentKind: 'prescription' | 'transfer';
  pdfStorageUrl: string | null;
  createdAt: string;
  patientName?: string | null;
}

export interface FollowUp {
  id: string;
  consultationId: string;
  doctorId: string;
  patientId: string;
  doctorMessage: string | null;
  patientReply: string | null;
  createdAt: string;
  replyAt: string | null;
  patientName?: string | null;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  consultationId: string | null;
  createdAt: string;
}

export interface DoctorStats {
  todayIncome: number;
  monthIncome: number;
  confirmedPatients: number;
}

export interface TriageDraft {
  step: number;
  biologicalSex?: string;
  severity?: string;
  duration?: string;
  symptomCategory?: string;
  symptomDescription?: string;
}

export interface RegularPatient {
  id: string;
  fullName: string;
  phoneNumber: string;
  visitCount: number;
  lastVisit: string;
}

export interface QueuePosition {
  position: number;
  total: number;
}

export interface Rating {
  stars: number;
  comment: string | null;
}

export interface DoctorRatings {
  average: number;
  count: number;
  recent: { stars: number; comment: string | null; createdAt: string; patientName: string | null }[];
}

export interface DoctorAnalytics {
  byCategory: { category: string; count: number }[];
  byWeek: { week: string; count: number }[];
  totalConsultations: number;
  completed: number;
  urgentCount: number;
  uniquePatients: number;
  repeatRate: number;
  avgRating: number;
  ratingCount: number;
}

export interface PatientHistory {
  patient: {
    id: string;
    fullName: string | null;
    phoneNumber: string | null;
    allergies: string | null;
    chronicConditions: string | null;
  };
  consultations: {
    id: string;
    status: CareStatus;
    symptomCategory: string | null;
    symptomDescription: string | null;
    severity: string | null;
    aiBriefSummary: string | null;
    urgency: Urgency;
    createdAt: string;
    closedAt: string | null;
  }[];
  documents: { id: string; documentKind: string; createdAt: string }[];
  dispenses: { medicineName: string | null; quantity: number; createdAt: string }[];
}

export interface MyData {
  patient: {
    id: string;
    fullName: string | null;
    phoneNumber: string | null;
    allergies: string | null;
    chronicConditions: string | null;
    memberSince: string;
  };
  consultations: Consultation[];
  documents: { id: string; documentKind: string; createdAt: string }[];
  dispenses: { medicineName: string | null; quantity: number; createdAt: string }[];
}

// --- Patient → doctor assignment (schedule-aware) ---
export interface DoctorCandidate {
  id: string;
  fullName: string | null;
  clinicName: string | null;
  onDuty: boolean;
  availableToday: boolean;
  todayOpen: string | null;
  todayClose: string | null;
  activeLoad: number;
  waitingLoad: number;
  totalOpen: number;
  avgRating: number | null;
  score: number;
  reasons: string[];
}

export interface AssignmentConsultation {
  id: string;
  patientId: string | null;
  patientName: string | null;
  patientPhone: string | null;
  doctorId: string | null;
  doctorName: string | null;
  status: CareStatus;
  symptomCategory: string | null;
  urgency: Urgency;
  urgencyScore: number;
  createdAt: string;
}

export interface AssignmentSuggestion {
  consultationId: string;
  recommendedDoctorId: string | null;
  summary: string;
  candidates: DoctorCandidate[];
}
