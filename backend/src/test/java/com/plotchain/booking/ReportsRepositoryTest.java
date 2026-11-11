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
    void pendingEmiIsDownlineOnlyActiveWithPendingInstallmentFilteredByLegAndCode() {
        BookingRegisterTestData d = new BookingRegisterTestData(associates, projects, plots, repo, installments);
        UUID project = d.project("Emi P");
        UUID root = d.associate();
        UUID left = child(d, root, "L");
        UUID right = child(d, root, "R");
        UUID outsider = d.associate();
        PlotBooking pendL = d.booking(left, project, BookingStatus.ACTIVE, 1);
        d.inst(pendL, 1, InstallmentStatus.PAID, "2026-06-01");
        d.inst(pendL, 2, InstallmentStatus.PENDING, "2026-07-01");
        PlotBooking pendR = d.booking(right, project, BookingStatus.ACTIVE, 2);
        d.inst(pendR, 1, InstallmentStatus.PENDING, "2026-07-01");
        PlotBooking fullyPaid = d.booking(left, project, BookingStatus.ACTIVE, 3);
        d.inst(fullyPaid, 1, InstallmentStatus.PAID, "2026-06-01");
        PlotBooking cancelled = d.booking(left, project, BookingStatus.CANCELLED, 4);
        d.inst(cancelled, 1, InstallmentStatus.PENDING, "2026-07-01");
        PlotBooking own = d.booking(root, project, BookingStatus.ACTIVE, 5);      // caller's own: not downline
        d.inst(own, 1, InstallmentStatus.PENDING, "2026-07-01");
        PlotBooking out = d.booking(outsider, project, BookingStatus.ACTIVE, 6);
        d.inst(out, 1, InstallmentStatus.PENDING, "2026-07-01");

        Instant from = Instant.EPOCH, to = Instant.parse("9999-01-01T00:00:00Z");
        org.springframework.data.domain.Pageable pg = org.springframework.data.domain.PageRequest.of(0, 50);
        assertThat(repo.findPendingByDownline(root, null, "", from, to, pg).getContent())
            .extracting(PlotBooking::getId).containsExactly(pendR.getId(), pendL.getId());   // newest first
        assertThat(repo.findPendingByDownline(root, "L", "", from, to, pg).getContent())
            .extracting(PlotBooking::getId).containsExactly(pendL.getId());
        assertThat(repo.findPendingByDownline(root, null, ("u-" + right).toLowerCase(), from, to, pg).getContent())
            .extracting(PlotBooking::getId).containsExactly(pendR.getId());
        // code of someone outside the downline never matches
        assertThat(repo.findPendingByDownline(root, null, ("u-" + outsider).toLowerCase(), from, to, pg).getContent()).isEmpty();
        // booked_at bounds (cycle period): booked_at = 2026-06-01 + offset days: pendL 06-02, pendR 06-03
        assertThat(repo.findPendingByDownline(root, null, "", Instant.parse("2026-06-03T00:00:00Z"),
            Instant.parse("2026-06-04T00:00:00Z"), pg).getContent()).extracting(PlotBooking::getId).containsExactly(pendR.getId());
        assertThat(repo.findPendingByDownline(left, null, "", from, to, pg).getContent()).isEmpty();
    }
}
