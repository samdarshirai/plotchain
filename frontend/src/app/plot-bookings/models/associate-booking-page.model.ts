export type BookingStatus = 'ACTIVE' | 'CONFIRMED' | 'CANCELLED';
export type InstallmentStatus = 'PENDING' | 'ENTERED' | 'PAID' | 'VOID';
export type PaymentMode = 'CASH' | 'CHEQUE' | 'UPI' | 'BANK_TRANSFER' | 'OTHER';
export const PAYMENT_MODES: PaymentMode[] = ['CASH', 'CHEQUE', 'UPI', 'BANK_TRANSFER', 'OTHER'];

export interface EmiInstallment {
  installmentNumber: number;
  amount: number;
  dueDate: string;
  status: InstallmentStatus;
  paidAt: string | null;
  overdue: boolean;
  paymentMode?: PaymentMode | null;
  confirmedAt?: string | null;
}

export interface Booking {
  id: string;
  plotId: string;
  associateId: string;
  status: BookingStatus;
  buyerName: string;
  totalAmount: number;
  installmentCount: number;
  bookedAt: string;
  paidAmount: number;
  dueAmount: number;
  installments: EmiInstallment[];
  // Added by plot-booking unit 14 (read-model follow-up); absent until it lands.
  plotNo?: string;
  projectName?: string;
  associateName?: string;
  buyerPhone?: string | null;
  listPrice?: number | null;
  discount?: number | null;
  areaSqft?: number | null;
  plotType?: 'NORMAL' | 'CORNER' | null;
  rate?: number | null;
  cancelledAt?: string | null;
  associateCode?: string | null;
  extraPrice?: number | null;
}

export interface AssociateBookingPage {
  bookings: Booking[];
  page: number;
  size: number;
  totalElements: number;
}
