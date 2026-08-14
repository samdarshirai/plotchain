export interface EmiInstallment {
  installmentNumber: number;
  amount: number;
  dueDate: string;
}

export interface Booking {
  id: string;
  plotId: string;
  associateId: string;
  totalAmount: number;
  installmentCount: number;
  bookedAt: string;
  installments: EmiInstallment[];
}

export interface AssociateBookingPage {
  bookings: Booking[];
  page: number;
  size: number;
  totalElements: number;
}
