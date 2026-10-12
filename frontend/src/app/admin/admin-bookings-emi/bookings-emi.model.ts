import { Booking, BookingStatus, PaymentMode } from '../../plot-bookings/models/associate-booking-page.model';

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
  bookedFrom?: string;
  bookedTo?: string;
  cancelledFrom?: string;
  cancelledTo?: string;
  q?: string;
}

export interface PayRequest { amount: number; paymentRef: string; paymentMode: PaymentMode; paidAt?: string; }

export interface PaymentRow {
  bookingId: string; installmentNumber: number; paymentDate: string;
  associateCode: string | null; associateName: string | null; projectName: string | null; plotNo: string | null;
  amount: number; paymentMode: PaymentMode | null; paymentRef: string | null;
  entryBy: string | null; confirmBy: string | null; confirmedAt: string | null;
}
export interface PaymentPage { payments: PaymentRow[]; page: number; size: number; totalElements: number; pageTotal: number; grandTotal: number; }
export interface PaymentFilters { from?: string; to?: string; projectId?: string; }
export interface PaymentRef { bookingId: string; installmentNumber: number; }

export interface LastEmiRow {
  bookingId: string; bookedAt: string; associateCode: string | null; associateName: string | null;
  buyerName: string; buyerPhone: string | null; plotNo: string | null; projectName: string | null;
  lastDueDate: string; discount: number | null; total: number; paid: number; rest: number;
}
export interface LastEmiFilters { from?: string; to?: string; projectId?: string; }

export interface FlashMessage { key: string; params?: Record<string, unknown>; }
