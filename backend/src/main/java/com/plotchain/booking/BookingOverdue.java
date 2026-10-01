package com.plotchain.booking;

// ONE definition of "overdue" for JPQL (Decision 7): PENDING and due strictly before :today.
// Compile-time constants so they can be concatenated into @Query strings. Alias contract:
// outer booking alias `b`, installment alias `i`, named parameter `:today` (LocalDate, the
// caller's LocalDate.now(clock)). Unit 9 (overdue report) reuses these; the Java-side flag in
// BookingService.toResponse must stay equivalent (pinned by BookingRegisterServiceTest).
final class BookingOverdue {
    private BookingOverdue() {}

    // For queries that already join/scan installments `i` (e.g. unit 9's GROUP BY count/sum/min).
    static final String INSTALLMENT_CONDITION =
        "i.status = com.plotchain.booking.InstallmentStatus.PENDING AND i.dueDate < :today";

    // For filtering bookings `b` without multiplying rows.
    static final String EXISTS_OVERDUE =
        "EXISTS (SELECT 1 FROM EmiInstallment i WHERE i.bookingId = b.id AND " + INSTALLMENT_CONDITION + ")";
}
