package com.plotchain.booking;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

// totalAmount is always a server-computed snapshot of Plot.price at booking time (same convention
// as Sales' CreateSaleRequest omitting amount), and the installment split always derives from the
// singleton BookingEmiConfig policy. The one client-supplied amount is tokenAmount: it is recorded
// as installment 1, already PAID, and the rest of the price is split across the other installments.
// Optional extraPercent (% of list price) wins over extraPrice; both null = the plot's default. Optional extraPrice (null = the plot's default) is added to the list price. Optional discount (null = 0) comes off the list price. The upper bounds (discount below the plot price,
// token below the discounted total) need the plot, so BookingService checks them.
public record CreateBookingRequest(
    @NotNull UUID plotId,
    @NotNull UUID associateId,
    @NotBlank @Size(max = 200) String buyerName,
    @Size(max = 20) String buyerPhone,
    @NotNull @Positive BigDecimal tokenAmount,
    @PositiveOrZero BigDecimal discount,
    @PositiveOrZero BigDecimal extraPrice,
    PaymentMode paymentMode,
    @Size(max = 100) String txnNo,
    @Size(max = 100) String bankName,
    LocalDate txnDate,
    @Positive BigDecimal firstInstallmentAmount,
    @DecimalMin("0") @DecimalMax("100") BigDecimal extraPercent
) {
    public CreateBookingRequest(UUID plotId, UUID associateId, String buyerName, String buyerPhone,
                                BigDecimal tokenAmount, BigDecimal discount, BigDecimal extraPrice,
                                PaymentMode paymentMode, String txnNo, String bankName, LocalDate txnDate,
                                BigDecimal firstInstallmentAmount) {
        this(plotId, associateId, buyerName, buyerPhone, tokenAmount, discount, extraPrice, paymentMode, txnNo, bankName, txnDate, firstInstallmentAmount, null);
    }

    public CreateBookingRequest(UUID plotId, UUID associateId, String buyerName, String buyerPhone,
                                BigDecimal tokenAmount, BigDecimal discount, BigDecimal extraPrice) {
        this(plotId, associateId, buyerName, buyerPhone, tokenAmount, discount, extraPrice, null, null, null, null, null);
    }

    public CreateBookingRequest(UUID plotId, UUID associateId, String buyerName, String buyerPhone,
                                BigDecimal tokenAmount, BigDecimal discount) {
        this(plotId, associateId, buyerName, buyerPhone, tokenAmount, discount, null, null, null, null, null, null);
    }

    public CreateBookingRequest(UUID plotId, UUID associateId, String buyerName, String buyerPhone, BigDecimal tokenAmount) {
        this(plotId, associateId, buyerName, buyerPhone, tokenAmount, null, null, null, null, null, null, null);
    }
}
