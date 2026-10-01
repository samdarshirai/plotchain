package com.plotchain.booking;

import com.plotchain.associate.AssociateRepository;
import com.plotchain.projects.Plot;
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

import java.time.Clock;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static com.plotchain.booking.BookingRegisterTestData.TODAY;
import static org.assertj.core.api.Assertions.assertThat;

// Real-DB (H2 + Flyway) proof of the unit 9 grouped query. @Transactional => rollback; other test
// classes may leave committed rows, so order assertions filter to this test's booking ids and total
// assertions use a delta against the count taken before seeding. Due dates are offsets from the
// fixed TODAY (never LocalDate.now()).
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class OverdueReportIntegrationTest {

    @Autowired PlotBookingRepository repo;
    @Autowired AssociateRepository associates;
    @Autowired ProjectRepository projects;
    @Autowired PlotRepository plots;
    @Autowired EmiInstallmentRepository installments;

    BookingRegisterTestData d;
    UUID project, assoc;
    long before;
    int offset = 0;
    final List<UUID> tracked = new ArrayList<>();

    @BeforeEach
    void setUp() {
        d = new BookingRegisterTestData(associates, projects, plots, repo, installments);
        before = total();
        project = d.project("Overdue P");
        assoc = d.associate();
    }

    private long total() { return repo.findOverdueReport(TODAY, PageRequest.of(0, 1)).getTotalElements(); }

    private static String due(int daysBeforeToday) { return TODAY.minusDays(daysBeforeToday).toString(); }

    // spec = "STATUS|daysBeforeToday|amount"
    private PlotBooking booking(BookingStatus status, String... specs) {
        return booking(status, offset++, UUID.randomUUID(), specs);
    }

    private PlotBooking booking(BookingStatus status, int bookedOffset, UUID id, String... specs) {
        PlotBooking b = d.booking(assoc, project, status, bookedOffset, id);
        tracked.add(b.getId());
        int n = 1;
        for (String s : specs) {
            String[] p = s.split("\\|");
            d.inst(b, n++, InstallmentStatus.valueOf(p[0]), due(Integer.parseInt(p[1])), p[2]);
        }
        return b;
    }

    private List<OverdueReportRow> mineAll() {
        return repo.findOverdueReport(TODAY, PageRequest.of(0, 1000)).getContent().stream()
            .filter(r -> tracked.contains(r.bookingId())).toList();
    }

    @Test
    void dueTodayIsNotOverdueButDueYesterdayIs() {
        booking(BookingStatus.ACTIVE, "PENDING|0|100.00");
        PlotBooking yday = booking(BookingStatus.ACTIVE, "PENDING|1|100.00");
        assertThat(mineAll()).extracting(OverdueReportRow::bookingId).containsExactly(yday.getId());
        assertThat(total() - before).isEqualTo(1);
    }

    @Test
    void paidAndVoidPastDueNeverCount_andMixedBookingCountsOnlyPending() {
        PlotBooking mixed = booking(BookingStatus.ACTIVE,
            "PAID|50|999.00", "VOID|40|888.00", "PENDING|20|150.00", "PENDING|-30|777.00");
        booking(BookingStatus.ACTIVE, "PAID|50|100.00", "VOID|40|100.00");
        List<OverdueReportRow> rows = mineAll();
        assertThat(rows).hasSize(1);
        OverdueReportRow r = rows.get(0);
        assertThat(r.bookingId()).isEqualTo(mixed.getId());
        assertThat(r.overdueCount()).isEqualTo(1);
        assertThat(r.overdueAmount()).isEqualByComparingTo("150.00");
        assertThat(r.oldestDueDate()).isEqualTo(TODAY.minusDays(20));
    }

    @Test
    void confirmedAndCancelledBookingsAreExcluded() {
        booking(BookingStatus.CONFIRMED, "PENDING|5|100.00");
        booking(BookingStatus.CANCELLED, "PENDING|5|100.00");
        assertThat(mineAll()).isEmpty();
        assertThat(total()).isEqualTo(before);
    }

    @Test
    void manyOverdueInstallmentsOnOneBookingAreOneRowWithCorrectCountSumMinAndTotalElements() {
        PlotBooking b = booking(BookingStatus.ACTIVE, "PENDING|30|100.00", "PENDING|10|200.00", "PENDING|1|300.00");
        List<OverdueReportRow> rows = mineAll();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).bookingId()).isEqualTo(b.getId());
        assertThat(rows.get(0).overdueCount()).isEqualTo(3);
        assertThat(rows.get(0).overdueAmount()).isEqualByComparingTo("600.00");
        assertThat(rows.get(0).oldestDueDate()).isEqualTo(TODAY.minusDays(30));
        assertThat(total() - before).isEqualTo(1);
    }

    @Test
    void rowCarriesAssociateNameBuyerPlotAndIds() {
        PlotBooking b = booking(BookingStatus.ACTIVE, "PENDING|3|100.00");
        Plot plot = plots.findById(b.getPlotId()).orElseThrow();
        OverdueReportRow r = mineAll().get(0);
        assertThat(r.plotId()).isEqualTo(b.getPlotId());
        assertThat(r.plotNo()).isEqualTo(plot.getPlotNo());
        assertThat(r.associateId()).isEqualTo(assoc);
        assertThat(r.associateName()).isEqualTo("Reg Associate");
        assertThat(r.buyerName()).isEqualTo(b.getBuyerName());
    }

    @Test
    void sortsByOldestOverdueAscendingThenBookedAtThenId() {
        PlotBooking b1 = booking(BookingStatus.ACTIVE, 1, new UUID(0, 9001), "PENDING|5|10.00");
        PlotBooking tieIdHi = booking(BookingStatus.ACTIVE, 2, new UUID(0, 9003), "PENDING|40|10.00");
        PlotBooking tieIdLo = booking(BookingStatus.ACTIVE, 2, new UUID(0, 9002), "PENDING|40|10.00"); // same bookedAt: id breaks tie
        PlotBooking tieEarlier = booking(BookingStatus.ACTIVE, 0, new UUID(0, 9004), "PENDING|40|10.00"); // earlier bookedAt first
        assertThat(mineAll()).extracting(OverdueReportRow::bookingId)
            .containsExactly(tieEarlier.getId(), tieIdLo.getId(), tieIdHi.getId(), b1.getId());
    }

    @Test
    void pagingSplitsRowsAndTotalElementsCountsBookingsNotInstallments() {
        booking(BookingStatus.ACTIVE, "PENDING|3|1.00", "PENDING|4|1.00");
        booking(BookingStatus.ACTIVE, "PENDING|5|1.00");
        booking(BookingStatus.ACTIVE, "PENDING|6|1.00");
        assertThat(total() - before).isEqualTo(3);   // 4 overdue installments, 3 bookings
        Page<OverdueReportRow> p0 = repo.findOverdueReport(TODAY, PageRequest.of(0, 2));
        assertThat(p0.getContent()).hasSize(2);
        assertThat(p0.getTotalElements()).isEqualTo(before + 3);
        Page<OverdueReportRow> beyond = repo.findOverdueReport(TODAY, PageRequest.of(5000, 20));
        assertThat(beyond.getContent()).isEmpty();
        assertThat(beyond.getTotalElements()).isEqualTo(before + 3);
    }

    // Not the Spring Clock bean: a fixed Clock makes this immune to midnight-UTC drift.
    @Test
    void serviceWithFixedClockReportsTheSeededOverdueBooking() {
        PlotBooking overdue = booking(BookingStatus.ACTIVE, "PENDING|2|100.00");
        booking(BookingStatus.ACTIVE, "PENDING|0|100.00");
        OverdueReportService service = new OverdueReportService(repo,
            Clock.fixed(TODAY.atStartOfDay(ZoneOffset.UTC).toInstant(), ZoneOffset.UTC));
        OverdueReportPageResponse r = service.getOverdueReport(0, 1000);
        assertThat(r.rows()).extracting(OverdueReportRow::bookingId).filteredOn(tracked::contains)
            .containsExactly(overdue.getId());
        assertThat(r.totalElements()).isEqualTo(before + 1);
    }

    @Test
    void emptyWhenNothingOverdue() {
        booking(BookingStatus.ACTIVE, "PENDING|0|100.00", "PENDING|-5|100.00");
        assertThat(mineAll()).isEmpty();
        assertThat(total()).isEqualTo(before);
    }

    // Parity guard with unit 8 (BookingOverdue): for the same data and date, this report's booking
    // set equals the register's overdue=true set.
    @Test
    void reportBookingSetEqualsRegisterOverdueSet() {
        BookingRegisterTestData s = new BookingRegisterTestData(associates, projects, plots, repo, installments).seed();
        List<UUID> seededIds = List.of(s.b1, s.b2, s.b3, s.b4, s.b5, s.b6, s.b7, s.b8)
            .stream().map(PlotBooking::getId).toList();
        List<UUID> report = repo.findOverdueReport(TODAY, PageRequest.of(0, 1000)).getContent().stream()
            .map(OverdueReportRow::bookingId).filter(seededIds::contains).sorted().toList();
        List<UUID> register = repo.search(null, null, null, null, true, TODAY, PageRequest.of(0, 1000)).getContent().stream()
            .map(PlotBooking::getId).filter(seededIds::contains).sorted().toList();
        assertThat(report).isEqualTo(register);
        assertThat(report).containsExactlyInAnyOrder(s.b1.getId(), s.b6.getId());
    }
}
