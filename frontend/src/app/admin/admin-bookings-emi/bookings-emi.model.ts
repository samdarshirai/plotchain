import { Booking, BookingStatus } from '../../plot-bookings/models/associate-booking-page.model';

export interface BookingEmiConfig {
  emiEnabled: boolean;
  defaultInstallmentCount: number;
  confirmRule: 'MANUAL' | 'AUTO_THRESHOLD';
  confirmThresholdPercent: number | null;
  updatedAt: string;
}

export interface BookingPage { bookings: Booking[]; page: number; size: number; totalElements: number; }

export interface OverdueRow {
  bookingId: string; plotId: string; plotNo: string; associateId: string; associateName: string;
  buyerName: string; overdueCount: number; overdueAmount: number; oldestDueDate: string;
}
export interface OverdueReportPage { rows: OverdueRow[]; page: number; size: number; totalElements: number; }

export interface RegisterFilters {
  status: '' | BookingStatus;
  associateId: string;
  plotId: string;
  projectId: string;
  overdue: boolean;
}

export interface PayRequest { amount: number; paymentRef: string; paidAt?: string; }

export interface FlashMessage { key: string; params?: Record<string, unknown>; }
