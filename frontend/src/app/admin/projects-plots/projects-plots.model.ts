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
  discount: number; // always emitted by the form (0 when blank)
  extraPrice?: number; // prefilled from the plot, editable; omitted = plot default
}

export interface CreateBookingRequest {
  plotId: string;
  associateId: string;
  buyerName: string;
  buyerPhone?: string;
  tokenAmount: number;
  discount?: number;
  extraPrice?: number;
}

// The subset of BookingResponse (POST /api/admin/bookings, 201) this screen reads.
export interface CreatedBooking {
  id: string;
  plotId: string;
  buyerName: string;
  totalAmount: number;
  installmentCount: number;
}
