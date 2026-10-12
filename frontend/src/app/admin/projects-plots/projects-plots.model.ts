export interface BookingEmiConfig {
  emiEnabled: boolean;
  defaultInstallmentCount: number;
}

// What the Book form emits; the container adds plotId.
export interface BookingFormValue {
  associateId: string;
  buyerName: string;
  buyerPhone: string;
  tokenAmount: number;
  discount?: number; // form always emits it (0 when blank); optional so the container spec compiles until Task 4
}

export interface CreateBookingRequest {
  plotId: string;
  associateId: string;
  buyerName: string;
  buyerPhone?: string;
  tokenAmount: number;
  discount?: number;
}

// The subset of BookingResponse (POST /api/admin/bookings, 201) this screen reads.
export interface CreatedBooking {
  id: string;
  plotId: string;
  buyerName: string;
  totalAmount: number;
  installmentCount: number;
}
