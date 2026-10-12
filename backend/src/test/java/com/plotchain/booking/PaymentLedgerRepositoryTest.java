package com.plotchain.booking;

import com.plotchain.associate.AssociateRepository;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.ProjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Real-DB proof of the admin payments list. Assertions are scoped to the seeded projects.
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class PaymentLedgerRepositoryTest {

    static final Instant MAX = Instant.parse("9999-01-01T00:00:00Z");

    @Autowired PlotBookingRepository bookings;
    @Autowired EmiInstallmentRepository installments;
    @Autowired AssociateRepository associates;
    @Autowired ProjectRepository projects;
    @Autowired PlotRepository plots;

    BookingRegisterTestData d;

    @BeforeEach
    void seed() {
        d = new BookingRegisterTestData(associates, projects, plots, bookings, installments).seed();
        // b1 inst1 ENTERED 06-10 CASH by a1; b2 inst1 ENTERED 06-12 UPI by a2; b7 inst1 PAID 06-05 confirmed by a1 at 06-06
        update(d.b1, InstallmentStatus.ENTERED, "2026-06-10T10:00:00Z", PaymentMode.CASH, "R1", d.a1, null, null);
        update(d.b2, InstallmentStatus.ENTERED, "2026-06-12T10:00:00Z", PaymentMode.UPI, "R2", d.a2, null, null);
        update(d.b7, InstallmentStatus.PAID, "2026-06-05T10:00:00Z", PaymentMode.CASH, "R7", d.a2, "2026-06-06T10:00:00Z", d.a1);
    }

    private void update(PlotBooking b, InstallmentStatus status, String paidAt, PaymentMode mode, String ref,
                        UUID recordedBy, String confirmedAt, UUID confirmedBy) {
        EmiInstallment i = installments.findByBookingIdOrderByInstallmentNumberAsc(b.getId()).get(0);
        i.setStatus(status);
        i.setPaidAt(Instant.parse(paidAt));
        i.setPaymentMode(mode);
        i.setPaymentRef(ref);
        i.setRecordedBy(recordedBy);
        i.setConfirmedAt(confirmedAt == null ? null : Instant.parse(confirmedAt));
        i.setConfirmedBy(confirmedBy);
        installments.saveAndFlush(i);
    }

    private Page<PaymentRow> find(InstallmentStatus s, Instant from, Instant to, UUID project, int page, int size) {
        return installments.findPayments(s, from, to, false, project, PageRequest.of(page, size));
    }

    @Test
    void enteredFilterReturnsOnlyEnteredRowsNewestPaymentFirstWithJoinedLabels() {
        Page<PaymentRow> p = find(InstallmentStatus.ENTERED, Instant.EPOCH, MAX, d.p1, 0, 50);
        assertThat(p.getContent()).extracting(PaymentRow::bookingId).containsExactly(d.b2.getId(), d.b1.getId());
        PaymentRow r = p.getContent().get(1);   // b1
        assertThat(r.associateCode()).isEqualTo(associates.findById(d.a1).orElseThrow().getUserId());
        assertThat(r.associateName()).isEqualTo("Reg Associate");
        assertThat(r.projectName()).isEqualTo("Reg P1");
        assertThat(r.plotNo()).isNotBlank();
        assertThat(r.paymentMode()).isEqualTo(PaymentMode.CASH);
        assertThat(r.paymentRef()).isEqualTo("R1");
        assertThat(r.installmentNumber()).isEqualTo(1);
        assertThat(r.amount()).isEqualByComparingTo("200000.00");
        assertThat(r.entryBy()).isEqualTo("Reg Associate");
        assertThat(r.confirmBy()).isNull();
        assertThat(r.confirmedAt()).isNull();
    }

    @Test
    void paidFilterExcludesEnteredAndCarriesConfirmByAndConfirmedAt() {
        Page<PaymentRow> p = find(InstallmentStatus.PAID, Instant.EPOCH, MAX, d.p2, 0, 50);
        assertThat(p.getContent()).extracting(PaymentRow::bookingId).containsExactly(d.b7.getId());
        assertThat(p.getContent().get(0).confirmBy()).isEqualTo("Reg Associate");
        assertThat(p.getContent().get(0).confirmedAt()).isEqualTo(Instant.parse("2026-06-06T10:00:00Z"));
    }

    @Test
    void dateRangeIsHalfOpenOnPaidAt() {
        Instant from = Instant.parse("2026-06-10T00:00:00Z");
        assertThat(find(InstallmentStatus.ENTERED, from, Instant.parse("2026-06-12T10:00:00Z"), d.p1, 0, 50)
            .getContent()).extracting(PaymentRow::bookingId).containsExactly(d.b1.getId());   // b2 at exactly `to` is out
        assertThat(find(InstallmentStatus.ENTERED, from, Instant.parse("2026-06-12T10:00:01Z"), d.p1, 0, 50)
            .getTotalElements()).isEqualTo(2);
    }

    @Test
    void projectFilterNullMeansAllProjects() {
        assertThat(find(InstallmentStatus.ENTERED, Instant.EPOCH, MAX, null, 0, 500).getContent())
            .extracting(PaymentRow::bookingId).contains(d.b1.getId(), d.b2.getId());
    }

    @Test
    void unboundedQueryIncludesLegacyRowsWithNullPaidAtButADateRangeExcludesThem() {
        EmiInstallment legacy = installments.findByBookingIdOrderByInstallmentNumberAsc(d.b7.getId()).get(0);
        legacy.setPaidAt(null);
        installments.saveAndFlush(legacy);

        assertThat(installments.findPayments(InstallmentStatus.PAID, Instant.EPOCH, MAX, true, null,
            PageRequest.of(0, 500)).getContent()).extracting(PaymentRow::bookingId).contains(d.b7.getId());
        assertThat(installments.findPayments(InstallmentStatus.PAID, Instant.EPOCH, MAX, false, null,
            PageRequest.of(0, 500)).getContent()).extracting(PaymentRow::bookingId).doesNotContain(d.b7.getId());
    }

    @Test
    void grandTotalSumsEveryFilteredRowNotJustThePage() {
        Page<PaymentRow> p = find(InstallmentStatus.ENTERED, Instant.EPOCH, MAX, d.p1, 0, 1);
        assertThat(p.getContent()).hasSize(1);
        assertThat(p.getTotalElements()).isEqualTo(2);
        assertThat(installments.sumPayments(InstallmentStatus.ENTERED, Instant.EPOCH, MAX, false, d.p1))
            .isEqualByComparingTo(new BigDecimal("400000.00"));
    }

    @Test
    void rowWithNullEntryByAndNullModeStillAppears() {
        EmiInstallment i = installments.findByBookingIdOrderByInstallmentNumberAsc(d.b3.getId()).get(0);   // already PAID
        i.setPaidAt(Instant.parse("2026-06-01T00:00:00Z"));
        installments.saveAndFlush(i);
        Page<PaymentRow> p = find(InstallmentStatus.PAID, Instant.EPOCH, MAX, d.p1, 0, 50);
        assertThat(p.getContent()).hasSize(1);
        assertThat(p.getContent().get(0).entryBy()).isNull();
        assertThat(p.getContent().get(0).paymentMode()).isNull();
        assertThat(p.getContent().get(0).confirmBy()).isNull();
    }
}
