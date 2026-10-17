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
  hasPending?: boolean;
}

export interface PayRequest { amount: number; paymentRef: string; paymentMode: PaymentMode; paidAt?: string; }

export interface TopUpRequest { amount: number; paymentMode: PaymentMode; bankName?: string; paymentRef: string; paidAt?: string; }

export interface RescheduleRequest { installmentCount: number; firstDueDate: string; }

export interface PaymentRow {
  bookingId: string; installmentNumber: number; paymentDate: string;
  associateCode: string | null; associateName: string | null; projectName: string | null; plotNo: string | null;
  amount: number; paymentMode: PaymentMode | null; paymentRef: string | null;
  entryBy: string | null; confirmBy: string | null; confirmedAt: string | null;
  bookedAt?: string | null; associatePhone?: string | null; plotType?: string | null; areaSqft?: number | null;
  rate?: number | null; extraPrice?: number | null; discount?: number | null;
  totalAmount?: number | null; paidAmount?: number | null; dueAmount?: number | null;
}
export interface PaymentPage { payments: PaymentRow[]; page: number; size: number; totalElements: number; pageTotal: number; grandTotal: number; }
export interface PaymentFilters { from?: string; to?: string; projectId?: string; }
export interface PlotTransferRow {
  transferDate: string; associateCode: string | null; associateName: string | null; associatePhone: string | null;
  projectName: string | null; plotNo: string | null; oldPlotNo: string | null; paidAmount: number; restAmount: number;
}
export interface PlotTransferPage { transfers: PlotTransferRow[]; page: number; size: number; totalElements: number; }
export interface PaymentRef { bookingId: string; installmentNumber: number; }

export interface LastEmiRow {
  bookingId: string; bookedAt: string; associateCode: string | null; associateName: string | null;
  buyerName: string; buyerPhone: string | null; plotNo: string | null; projectName: string | null;
  lastDueDate: string; discount: number | null; total: number; paid: number; rest: number;
}
export interface LastEmiFilters { from?: string; to?: string; projectId?: string; }

export interface FlashMessage { key: string; params?: Record<string, unknown>; }
