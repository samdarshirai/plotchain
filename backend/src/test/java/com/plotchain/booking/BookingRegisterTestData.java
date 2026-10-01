package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectRepository;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

// Seeds the unit-8 matrix (see plan). Call inside a @Transactional test: nothing is cleaned up.
class BookingRegisterTestData {
    static final Instant T = Instant.parse("2026-06-01T00:00:00Z");
    static final LocalDate TODAY = LocalDate.of(2026, 6, 15);

    UUID p1, p2, a1, a2;
    PlotBooking b1, b2, b3, b4, b5, b6, b7, b8;

    private final AssociateRepository associates;
    private final ProjectRepository projects;
    private final PlotRepository plots;
    private final PlotBookingRepository bookings;
    private final EmiInstallmentRepository installments;

    BookingRegisterTestData(AssociateRepository associates, ProjectRepository projects, PlotRepository plots,
                            PlotBookingRepository bookings, EmiInstallmentRepository installments) {
        this.associates = associates; this.projects = projects; this.plots = plots;
        this.bookings = bookings; this.installments = installments;
    }

    BookingRegisterTestData seed() {
        p1 = project("Reg P1");
        p2 = project("Reg P2");
        a1 = associate();
        a2 = associate();
        b1 = booking(a1, p1, BookingStatus.ACTIVE, 1);
        inst(b1, 1, InstallmentStatus.PENDING, "2026-06-14");
        inst(b1, 2, InstallmentStatus.PENDING, "2026-06-10");
        inst(b1, 3, InstallmentStatus.PENDING, "2026-07-15");
        b2 = booking(a1, p1, BookingStatus.ACTIVE, 2);
        inst(b2, 1, InstallmentStatus.PENDING, "2026-06-15");
        b3 = booking(a2, p1, BookingStatus.ACTIVE, 3);
        inst(b3, 1, InstallmentStatus.PAID, "2026-05-01");
        inst(b3, 2, InstallmentStatus.PENDING, "2026-08-01");
        b4 = booking(a2, p2, BookingStatus.CONFIRMED, 4);
        inst(b4, 1, InstallmentStatus.PENDING, "2026-05-01");
        b5 = booking(a1, p2, BookingStatus.CANCELLED, 5);
        inst(b5, 1, InstallmentStatus.VOID, "2026-05-01");
        b6 = booking(a2, p2, BookingStatus.ACTIVE, 6, new UUID(0, 6));
        inst(b6, 1, InstallmentStatus.PENDING, "2026-06-14");
        b7 = booking(a2, p2, BookingStatus.ACTIVE, 6, new UUID(0, 7)); // same booked_at as b6: tiebreak case
        inst(b7, 1, InstallmentStatus.PAID, "2026-05-01");
        b8 = booking(a1, p1, BookingStatus.ACTIVE, 0);          // zero installments
        return this;
    }

    UUID project(String name) {
        Project p = new Project(UUID.randomUUID(), name, "Hyderabad", null, null, Instant.now());
        return projects.saveAndFlush(p).getId();
    }

    UUID associate() {
        UUID id = UUID.randomUUID();
        Associate a = new Associate();
        a.setId(id);
        a.setPosition("L");
        a.setName("Reg Associate");
        a.setKycStatus(KycStatus.VERIFIED);
        a.setJoinedAt(Instant.now());
        a.setCumulativeMatchedVolume(BigDecimal.ZERO);
        a.setUserId("u-" + id);
        a.setEmail(id + "@test.local");
        a.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        a.setRole(AssociateRole.ADMIN);   // chk_associate_rank_required: ASSOCIATE rows need a rank_id
        return associates.saveAndFlush(a).getId();
    }

    PlotBooking booking(UUID associateId, UUID projectId, BookingStatus status, int bookedDayOffset) {
        return booking(associateId, projectId, status, bookedDayOffset, UUID.randomUUID());
    }

    // Fixed small ids for the b6/b7 tie: Java UUID order is signed, H2/Postgres order differs for random
    // ids with the high bit set, so random ids made the tiebreak assertion flaky.
    PlotBooking booking(UUID associateId, UUID projectId, BookingStatus status, int bookedDayOffset, UUID id) {
        Plot plot = plots.saveAndFlush(new Plot(UUID.randomUUID(), projectId, "R-" + UUID.randomUUID().toString().substring(0, 8),
            PlotType.NORMAL, new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"),
            status == BookingStatus.CONFIRMED ? PlotStatus.SOLD : PlotStatus.BOOKED));
        PlotBooking b = new PlotBooking();
        b.setId(id);
        b.setPlotId(plot.getId());
        b.setAssociateId(associateId);
        b.setTotalAmount(new BigDecimal("600000.00"));
        b.setInstallmentCount(3);
        b.setBookedAt(T.plusSeconds(86400L * bookedDayOffset));
        b.setBuyerName("Buyer " + bookedDayOffset);
        b.setStatus(status);
        return bookings.saveAndFlush(b);
    }

    void inst(PlotBooking b, int n, InstallmentStatus status, String due) {
        inst(b, n, status, due, "200000.00");
    }

    void inst(PlotBooking b, int n, InstallmentStatus status, String due, String amount) {
        EmiInstallment i = new EmiInstallment();
        i.setId(UUID.randomUUID());
        i.setBookingId(b.getId());
        i.setInstallmentNumber(n);
        i.setAmount(new BigDecimal(amount));
        i.setDueDate(LocalDate.parse(due));
        i.setStatus(status);
        installments.saveAndFlush(i);
    }
}
