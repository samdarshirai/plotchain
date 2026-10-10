package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.ProjectRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Real-DB proof of the report queries: leg split, date bounds, cancelled excluded, own-only EMI.
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ReportsRepositoryTest {

    @Autowired PlotBookingRepository repo;
    @Autowired AssociateRepository associates;
    @Autowired ProjectRepository projects;
    @Autowired PlotRepository plots;
    @Autowired EmiInstallmentRepository installments;

    private UUID child(BookingRegisterTestData d, UUID parent, String position) {
        UUID id = d.associate();
        Associate a = associates.findById(id).orElseThrow();
        a.setParentId(parent);
        a.setPosition(position);
        associates.saveAndFlush(a);
        return id;
    }

    @Test
    void businessIsSplitByLegBoundedByDateAndSkipsCancelled() {
        BookingRegisterTestData d = new BookingRegisterTestData(associates, projects, plots, repo, installments);
        UUID project = d.project("Report P");
        UUID root = d.associate();
        UUID left = child(d, root, "L");
        UUID right = child(d, root, "R");
        PlotBooking inL = d.booking(left, project, BookingStatus.ACTIVE, 2);      // 2026-06-03
        d.booking(left, project, BookingStatus.ACTIVE, 20);                       // out of range
        d.booking(left, project, BookingStatus.CANCELLED, 3);                     // cancelled
        PlotBooking inR = d.booking(right, project, BookingStatus.CONFIRMED, 2);

        Instant from = Instant.parse("2026-06-03T00:00:00Z"), to = Instant.parse("2026-06-04T00:00:00Z");
        assertThat(repo.findByDownlineBetween(root, "L", from, to)).extracting(PlotBooking::getId).containsExactly(inL.getId());
        assertThat(repo.findByDownlineBetween(root, "R", from, to)).extracting(PlotBooking::getId).containsExactly(inR.getId());
    }

    @Test
    void emiReportIsOwnPaidInstallmentsInRange() {
        BookingRegisterTestData d = new BookingRegisterTestData(associates, projects, plots, repo, installments);
        UUID project = d.project("Emi P");
        UUID me = d.associate(), other = d.associate();
        PlotBooking mine = d.booking(me, project, BookingStatus.ACTIVE, 1);
        PlotBooking theirs = d.booking(other, project, BookingStatus.ACTIVE, 1);
        paid(d, mine, 1, "2026-06-05T10:00:00Z", "UPI");
        paid(d, mine, 2, "2026-07-05T10:00:00Z", "CASH");   // out of range
        d.inst(mine, 3, InstallmentStatus.PENDING, "2026-06-20");
        paid(d, theirs, 1, "2026-06-05T10:00:00Z", "UPI");

        List<EmiReportRow> rows = installments.findEmiReport(me,
            Instant.parse("2026-06-01T00:00:00Z"), Instant.parse("2026-07-01T00:00:00Z"));
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).mode()).isEqualTo("UPI");
        assertThat(rows.get(0).associateId()).isEqualTo("u-" + me);
    }

    private void paid(BookingRegisterTestData d, PlotBooking b, int n, String paidAt, String ref) {
        d.inst(b, n, InstallmentStatus.PAID, "2026-06-01");
        EmiInstallment i = installments.findByBookingIdOrderByInstallmentNumberAsc(b.getId()).stream()
            .filter(x -> x.getInstallmentNumber() == n).findFirst().orElseThrow();
        i.setPaidAt(Instant.parse(paidAt));
        i.setPaymentRef(ref);
        installments.saveAndFlush(i);
    }
}
