package com.plotchain.booking;

import com.plotchain.projects.PlotType;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record BookingResponse(
    UUID id,
    UUID plotId,
    UUID associateId,
    BookingStatus status,
    String buyerName,
    BigDecimal totalAmount,
    int installmentCount,
    Instant bookedAt,
    BigDecimal paidAmount,
    BigDecimal dueAmount,
    List<EmiInstallmentResponse> installments,
    String plotNo,
    String projectName,
    String associateName,
    String buyerPhone,
    BigDecimal listPrice,
    BigDecimal discount,
    BigDecimal areaSqft,
    BigDecimal rate,
    Instant cancelledAt,
    String associateCode,
    PlotType plotType,
    BigDecimal extraPrice,
    String associatePhone,
    String cancelReason,
    BigDecimal roadSizeFt
) {
    // Pre-roadSizeFt shape, kept so existing callers need no change.
    public BookingResponse(UUID id, UUID plotId, UUID associateId, BookingStatus status, String buyerName,
                           BigDecimal totalAmount, int installmentCount, Instant bookedAt,
                           BigDecimal paidAmount, BigDecimal dueAmount, List<EmiInstallmentResponse> installments,
                           String plotNo, String projectName, String associateName,
                           String buyerPhone, BigDecimal listPrice, BigDecimal discount, BigDecimal areaSqft,
                           BigDecimal rate, Instant cancelledAt, String associateCode, PlotType plotType,
                           BigDecimal extraPrice, String associatePhone, String cancelReason) {
        this(id, plotId, associateId, status, buyerName, totalAmount, installmentCount, bookedAt,
            paidAmount, dueAmount, installments, plotNo, projectName, associateName, buyerPhone, listPrice,
            discount, areaSqft, rate, cancelledAt, associateCode, plotType, extraPrice, associatePhone,
            cancelReason, null);
    }

    public BookingResponse(UUID id, UUID plotId, UUID associateId, BookingStatus status, String buyerName,
                           BigDecimal totalAmount, int installmentCount, Instant bookedAt,
                           BigDecimal paidAmount, BigDecimal dueAmount, List<EmiInstallmentResponse> installments,
                           String plotNo, String projectName, String associateName,
                           String buyerPhone, BigDecimal listPrice, BigDecimal discount, BigDecimal areaSqft,
                           BigDecimal rate, Instant cancelledAt, String associateCode, PlotType plotType,
                           BigDecimal extraPrice, String associatePhone) {
        this(id, plotId, associateId, status, buyerName, totalAmount, installmentCount, bookedAt,
            paidAmount, dueAmount, installments, plotNo, projectName, associateName,
            buyerPhone, listPrice, discount, areaSqft, rate, cancelledAt, associateCode, plotType, extraPrice,
            associatePhone, null);
    }

    public BookingResponse(UUID id, UUID plotId, UUID associateId, BookingStatus status, String buyerName,
                           BigDecimal totalAmount, int installmentCount, Instant bookedAt,
                           BigDecimal paidAmount, BigDecimal dueAmount, List<EmiInstallmentResponse> installments,
                           String plotNo, String projectName, String associateName,
                           String buyerPhone, BigDecimal listPrice, BigDecimal discount, BigDecimal areaSqft,
                           BigDecimal rate, Instant cancelledAt, String associateCode, PlotType plotType,
                           BigDecimal extraPrice) {
        this(id, plotId, associateId, status, buyerName, totalAmount, installmentCount, bookedAt,
            paidAmount, dueAmount, installments, plotNo, projectName, associateName,
            buyerPhone, listPrice, discount, areaSqft, rate, cancelledAt, associateCode, plotType, extraPrice, null, null);
    }


    public BookingResponse(UUID id, UUID plotId, UUID associateId, BookingStatus status, String buyerName,
                           BigDecimal totalAmount, int installmentCount, Instant bookedAt,
                           BigDecimal paidAmount, BigDecimal dueAmount, List<EmiInstallmentResponse> installments,
                           String plotNo, String projectName, String associateName,
                           String buyerPhone, BigDecimal listPrice, BigDecimal discount, BigDecimal areaSqft,
                           BigDecimal rate, Instant cancelledAt, String associateCode, PlotType plotType) {
        this(id, plotId, associateId, status, buyerName, totalAmount, installmentCount, bookedAt,
            paidAmount, dueAmount, installments, plotNo, projectName, associateName,
            buyerPhone, listPrice, discount, areaSqft, rate, cancelledAt, associateCode, plotType, null);
    }

    public BookingResponse(UUID id, UUID plotId, UUID associateId, BookingStatus status, String buyerName,
                           BigDecimal totalAmount, int installmentCount, Instant bookedAt,
                           BigDecimal paidAmount, BigDecimal dueAmount, List<EmiInstallmentResponse> installments,
                           String plotNo, String projectName, String associateName,
                           String buyerPhone, BigDecimal listPrice, BigDecimal discount, BigDecimal areaSqft,
                           BigDecimal rate, Instant cancelledAt, String associateCode) {
        this(id, plotId, associateId, status, buyerName, totalAmount, installmentCount, bookedAt,
            paidAmount, dueAmount, installments, plotNo, projectName, associateName,
            buyerPhone, listPrice, discount, areaSqft, rate, cancelledAt, associateCode, null);
    }

    public BookingResponse(UUID id, UUID plotId, UUID associateId, BookingStatus status, String buyerName,
                           BigDecimal totalAmount, int installmentCount, Instant bookedAt,
                           BigDecimal paidAmount, BigDecimal dueAmount, List<EmiInstallmentResponse> installments,
                           String plotNo, String projectName, String associateName) {
        this(id, plotId, associateId, status, buyerName, totalAmount, installmentCount, bookedAt,
            paidAmount, dueAmount, installments, plotNo, projectName, associateName,
            null, null, null, null, null, null, null, null);
    }

    // Team (upline) view must not carry the buyer's phone; associate phone only for the caller's own sponsorees; rate and prices are shown.
    public BookingResponse withoutBuyerPhone(boolean keepAssociatePhone) {
        return new BookingResponse(id, plotId, associateId, status, buyerName, totalAmount, installmentCount, bookedAt,
            paidAmount, dueAmount, installments, plotNo, projectName, associateName,
            null, listPrice, discount, areaSqft, rate, cancelledAt, associateCode, plotType, extraPrice, keepAssociatePhone ? associatePhone : null, cancelReason, roadSizeFt);
    }

    // Labels are additive (unit 14b); null when the referent is gone or the caller has no lookup.
    public BookingResponse(UUID id, UUID plotId, UUID associateId, BookingStatus status, String buyerName,
                           BigDecimal totalAmount, int installmentCount, Instant bookedAt,
                           BigDecimal paidAmount, BigDecimal dueAmount, List<EmiInstallmentResponse> installments) {
        this(id, plotId, associateId, status, buyerName, totalAmount, installmentCount, bookedAt,
            paidAmount, dueAmount, installments, null, null, null);
    }
}
