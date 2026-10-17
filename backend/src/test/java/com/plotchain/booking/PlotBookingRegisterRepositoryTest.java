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
import org.springframework.data.domain.Sort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import static com.plotchain.booking.BookingRegisterTestData.TODAY;
import static org.assertj.core.api.Assertions.assertThat;

// Real-DB (H2 + Flyway) proof of the register query. @Transactional => every test rolls back.
// Every assertion scopes to the seeded projects (via projectId or an id-filter) because other
// test classes may leave committed rows behind.
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class PlotBookingRegisterRepositoryTest {

    static final Sort NEWEST_FIRST = Sort.by(Sort.Direction.DESC, "bookedAt").and(Sort.by(Sort.Direction.DESC, "id"));

    @Autowired PlotBookingRepository repo;
    @Autowired AssociateRepository associates;
    @Autowired ProjectRepository projects;
    @Autowired PlotRepository plots;
    @Autowired EmiInstallmentRepository installments;
    @Autowired BookingEventRepository events;

    BookingRegisterTestData d;

    @BeforeEach
    void seed() {
        d = new BookingRegisterTestData(associates, projects, plots, repo, installments).seed();
    }

    private Page<PlotBooking> search(BookingStatus status, UUID associateId, UUID plotId, UUID projectId,
                                     boolean overdue, int page, int size) {
        return repo.search(status, associateId, plotId, projectId, overdue, TODAY,
            Instant.EPOCH, MAX, false, Instant.EPOCH, MAX, "", false, PageRequest.of(page, size, NEWEST_FIRST));
    }

    static final Instant MAX = Instant.parse("9999-01-01T00:00:00Z");

    private Page<PlotBooking> searchWith(UUID projectId, Instant bookedFrom, Instant bookedTo,
                                         boolean cancelledFilter, Instant cancelledFrom, Instant cancelledTo, String q) {
        return repo.search(null, null, null, projectId, false, TODAY, bookedFrom, bookedTo,
            cancelledFilter, cancelledFrom, cancelledTo, q, false, PageRequest.of(0, 50, NEWEST_FIRST));
    }

    @Test
    void bookedRangeIncludesTheToDayUntil235959AndExcludesTheNextMidnight() {
        Instant from = Instant.parse("2026-06-03T00:00:00Z");
        Instant to = BookingService.toInstant(LocalDate.of(2026, 6, 3));   // 06-04T00:00Z, exclusive
        assertThat(ids(searchWith(d.p1, from, to, false, Instant.EPOCH, MAX, ""))).containsExactly(d.b2.getId());

        d.b1.setBookedAt(Instant.parse("2026-06-03T23:59:59Z"));
        repo.saveAndFlush(d.b1);
        assertThat(ids(searchWith(d.p1, from, to, false, Instant.EPOCH, MAX, "")))
            .containsExactlyInAnyOrder(d.b1.getId(), d.b2.getId());
    }

    @Test
    void cancelledRangeReturnsOnlyBookingsCancelledInsideIt() {
        d.b5.setCancelledAt(Instant.parse("2026-06-10T12:00:00Z"));
        repo.saveAndFlush(d.b5);
        assertThat(ids(searchWith(d.p2, Instant.EPOCH, MAX, true,
            Instant.parse("2026-06-10T00:00:00Z"), Instant.parse("2026-06-11T00:00:00Z"), "")))
            .containsExactly(d.b5.getId());
        assertThat(searchWith(d.p2, Instant.EPOCH, MAX, true,
            Instant.parse("2026-06-11T00:00:00Z"), MAX, "").getTotalElements()).isZero();
    }

    @Test
    void omittingTheCancelledFilterKeepsBookingsWithNullCancelledAt() {
        assertThat(searchWith(d.p1, Instant.EPOCH, MAX, false, Instant.EPOCH, MAX, "").getTotalElements()).isEqualTo(4);
    }

    @Test
    void qMatchesAssociateLoginIdCaseInsensitivelyAsSubstring() {
        String userId = associates.findById(d.a1).orElseThrow().getUserId();
        String needle = userId.substring(3, 15).toUpperCase();   // mixed case input is lowercased by the service
        assertThat(ids(searchWith(d.p1, Instant.EPOCH, MAX, false, Instant.EPOCH, MAX, needle.toLowerCase())))
            .containsExactlyInAnyOrder(d.b1.getId(), d.b2.getId(), d.b8.getId());
    }

    @Test
    void qMatchesPlotNoSubstring() {
        String plotNo = plots.findById(d.b2.getPlotId()).orElseThrow().getPlotNo().toLowerCase();
        assertThat(ids(searchWith(d.p1, Instant.EPOCH, MAX, false, Instant.EPOCH, MAX, plotNo))).contains(d.b2.getId());
    }

    @Test
    void blankQMeansNoFilterAndNoMatchReturnsEmpty() {
        assertThat(searchWith(d.p1, Instant.EPOCH, MAX, false, Instant.EPOCH, MAX, "").getTotalElements()).isEqualTo(4);
        assertThat(searchWith(d.p1, Instant.EPOCH, MAX, false, Instant.EPOCH, MAX, "zzzz-nope").getTotalElements()).isZero();
    }

    @Test
    void qCombinesWithProjectFilterUsingAnd() {
        String userId = associates.findById(d.a1).orElseThrow().getUserId();
        assertThat(ids(searchWith(d.p2, Instant.EPOCH, MAX, false, Instant.EPOCH, MAX, userId.substring(3, 15))))
            .containsExactly(d.b5.getId());
    }

    private static List<UUID> ids(Page<PlotBooking> p) { return p.getContent().stream().map(PlotBooking::getId).toList(); }

    // b6 and b7 share booked_at, so their relative order is id DESC.
    private List<UUID> b6b7ByIdDesc() {
        return List.of(d.b6.getId(), d.b7.getId()).stream().sorted(Comparator.reverseOrder()).toList();
    }

    @Test
    void projectFilterAloneReturnsBothProjectsInNewestFirstOrderWithExactTotals() {
        Page<PlotBooking> p1 = search(null, null, null, d.p1, false, 0, 50);
        assertThat(ids(p1)).containsExactly(d.b3.getId(), d.b2.getId(), d.b1.getId(), d.b8.getId());
        assertThat(p1.getTotalElements()).isEqualTo(4);

        Page<PlotBooking> p2 = search(null, null, null, d.p2, false, 0, 50);
        List<UUID> expected = new ArrayList<>(b6b7ByIdDesc());
        expected.add(d.b5.getId());
        expected.add(d.b4.getId());
        assertThat(ids(p2)).containsExactlyElementsOf(expected);   // tiebreak: id DESC
        assertThat(p2.getTotalElements()).isEqualTo(4);
    }

    @Test
    void statusFilter() {
        assertThat(ids(search(BookingStatus.CONFIRMED, null, null, d.p2, false, 0, 50))).containsExactly(d.b4.getId());
        assertThat(ids(search(BookingStatus.CANCELLED, null, null, d.p2, false, 0, 50))).containsExactly(d.b5.getId());
        assertThat(search(BookingStatus.ACTIVE, null, null, d.p1, false, 0, 50).getTotalElements()).isEqualTo(4);
    }

    @Test
    void associateAndPlotFilters() {
        assertThat(ids(search(null, d.a1, null, d.p1, false, 0, 50)))
            .containsExactly(d.b2.getId(), d.b1.getId(), d.b8.getId());
        assertThat(ids(search(null, null, d.b3.getPlotId(), null, false, 0, 50))).containsExactly(d.b3.getId());
        // plot + wrong project = empty (filters AND together)
        assertThat(search(null, null, d.b3.getPlotId(), d.p2, false, 0, 50).getTotalElements()).isZero();
    }

    @Test
    void overdueOnlyReturnsActiveBookingsWithAPendingInstallmentDueBeforeToday() {
        Page<PlotBooking> both = search(null, null, null, d.p1, true, 0, 50);
        assertThat(ids(both)).containsExactly(d.b1.getId());          // b2 due TODAY excluded, b3 PAID/future excluded
        Page<PlotBooking> p2 = search(null, null, null, d.p2, true, 0, 50);
        assertThat(ids(p2)).containsExactly(d.b6.getId());            // b4 CONFIRMED, b5 VOID, b7 PAID excluded
    }

    @Test
    void overdueWithTwoOverdueInstallmentsCountsTheBookingOnceAndTotalIsNotInflated() {
        // b1 has TWO overdue installments; a JOIN would give totalElements 2 and a duplicate row.
        Page<PlotBooking> p = search(null, d.a1, null, d.p1, true, 0, 50);
        assertThat(ids(p)).containsExactly(d.b1.getId());
        assertThat(p.getTotalElements()).isEqualTo(1);
    }

    @Test
    void overdueBoundaryUsesStrictlyBeforeToday() {
        // b2's only installment is due 06-15. today=06-15 -> not overdue; today=06-16 -> overdue.
        assertThat(repo.search(null, null, null, d.p1, true, TODAY.plusDays(1), java.time.Instant.EPOCH, java.time.Instant.parse("9999-01-01T00:00:00Z"), false, java.time.Instant.EPOCH, java.time.Instant.parse("9999-01-01T00:00:00Z"), "", false, PageRequest.of(0, 50, NEWEST_FIRST))
            .getContent()).extracting(PlotBooking::getId).contains(d.b2.getId());
        assertThat(repo.search(null, null, null, d.p1, true, TODAY, java.time.Instant.EPOCH, java.time.Instant.parse("9999-01-01T00:00:00Z"), false, java.time.Instant.EPOCH, java.time.Instant.parse("9999-01-01T00:00:00Z"), "", false, PageRequest.of(0, 50, NEWEST_FIRST))
            .getContent()).extracting(PlotBooking::getId).doesNotContain(d.b2.getId());
    }

    @Test
    void overdueNeverIncludesConfirmedOrCancelledEvenWithPastDuePendingInstallments() {
        assertThat(search(BookingStatus.CONFIRMED, null, null, d.p2, true, 0, 50).getTotalElements()).isZero();
        assertThat(search(BookingStatus.CANCELLED, null, null, d.p2, true, 0, 50).getTotalElements()).isZero();
    }

    @Test
    void combinedFilters() {
        assertThat(ids(search(BookingStatus.ACTIVE, d.a2, null, d.p2, true, 0, 50))).containsExactly(d.b6.getId());
        assertThat(search(BookingStatus.ACTIVE, d.a1, null, d.p2, false, 0, 50).getTotalElements()).isZero();
    }

    @Test
    void unknownIdsGiveAnEmptyPage() {
        assertThat(search(null, UUID.randomUUID(), null, null, false, 0, 50).getTotalElements()).isZero();
        assertThat(search(null, null, UUID.randomUUID(), null, false, 0, 50).getTotalElements()).isZero();
        assertThat(search(null, null, null, UUID.randomUUID(), false, 0, 50).getContent()).isEmpty();
    }

    @Test
    void paginationKeepsTheTrueTotalAndAStableOrderAcrossPages() {
        Page<PlotBooking> first = search(null, null, null, d.p2, false, 0, 3);
        Page<PlotBooking> second = search(null, null, null, d.p2, false, 1, 3);
        Page<PlotBooking> beyond = search(null, null, null, d.p2, false, 5, 3);
        assertThat(first.getTotalElements()).isEqualTo(4);
        assertThat(ids(first)).hasSize(3);
        assertThat(ids(second)).containsExactly(d.b4.getId());
        assertThat(beyond.getContent()).isEmpty();
        assertThat(beyond.getTotalElements()).isEqualTo(4);
    }
}
