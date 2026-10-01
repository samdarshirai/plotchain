export type BookingStatus = 'ACTIVE' | 'CONFIRMED' | 'CANCELLED';
export type InstallmentStatus = 'PENDING' | 'PAID' | 'VOID';

export interface EmiInstallment {
  installmentNumber: number;
  amount: number;
  dueDate: string;
  status: InstallmentStatus;
  paidAt: string | null;
  overdue: boolean;
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
}

export interface AssociateBookingPage {
  bookings: Booking[];
  page: number;
  size: number;
  totalElements: number;
}
