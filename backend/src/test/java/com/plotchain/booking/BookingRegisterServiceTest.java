package com.plotchain.booking;

import com.plotchain.associate.AssociateRepository;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.ProjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class BookingRegisterServiceTest {

    @TestConfiguration
    static class FixedClockConfig {
        @Bean @Primary
        Clock fixedClock() { return Clock.fixed(Instant.parse("2026-06-15T10:00:00Z"), ZoneOffset.UTC); }
    }

    @Autowired BookingRegisterService service;
    @Autowired PlotBookingRepository bookings;
    @Autowired AssociateRepository associates;
    @Autowired ProjectRepository projects;
    @Autowired PlotRepository plots;
    @SpyBean EmiInstallmentRepository installments;

    BookingRegisterTestData d;

    @BeforeEach
    void seed() {
        d = new BookingRegisterTestData(associates, projects, plots, bookings, installments).seed();
        reset(installments);   // forget the seeding calls; only count the service's reads
    }

    private static List<UUID> ids(AdminBookingPageResponse p) {
        return p.bookings().stream().map(BookingResponse::id).toList();
    }

    @Test
    void rowsCarryStatusBuyerPaidDueAndPerInstallmentOverdueFlagsFromTheInjectedClock() {
        AdminBookingPageResponse page = service.list(null, d.a1, null, d.p1, false, 0, 50);
        assertThat(ids(page)).containsExactly(d.b2.getId(), d.b1.getId(), d.b8.getId());

        BookingResponse b1 = page.bookings().get(1);
        assertThat(b1.status()).isEqualTo(BookingStatus.ACTIVE);
        assertThat(b1.buyerName()).isEqualTo("Buyer 1");
        assertThat(b1.installments()).extracting(EmiInstallmentResponse::installmentNumber).containsExactly(1, 2, 3);
        assertThat(b1.installments()).extracting(EmiInstallmentResponse::overdue).containsExactly(true, true, false);
        assertThat(b1.paidAmount()).isEqualByComparingTo("0");
        assertThat(b1.dueAmount()).isEqualByComparingTo("600000.00");

        // due today is NOT overdue
        assertThat(page.bookings().get(0).installments().get(0).overdue()).isFalse();
        // zero installments maps cleanly
        BookingResponse b8 = page.bookings().get(2);
        assertThat(b8.installments()).isEmpty();
        assertThat(b8.paidAmount()).isEqualByComparingTo("0");
        assertThat(b8.dueAmount()).isEqualByComparingTo("0");
    }

    @Test
    void paidAndVoidInstallmentsAreNeverFlaggedOverdueEvenWhenPastDue() {
        AdminBookingPageResponse p2 = service.list(null, null, null, d.p2, false, 0, 50);
        BookingResponse b5 = p2.bookings().stream().filter(b -> b.id().equals(d.b5.getId())).findFirst().orElseThrow();
        BookingResponse b7 = p2.bookings().stream().filter(b -> b.id().equals(d.b7.getId())).findFirst().orElseThrow();
        assertThat(b5.installments().get(0).overdue()).isFalse();   // VOID
        assertThat(b7.installments().get(0).overdue()).isFalse();   // PAID
    }

    @Test
    void overdueFilterAgreesWithTheRowFlags() {
        AdminBookingPageResponse overdue = service.list(null, null, null, null, true, 0, 100);
        List<UUID> seeded = List.of(d.b1.getId(), d.b2.getId(), d.b3.getId(), d.b4.getId(), d.b6.getId());
        List<BookingResponse> mine = overdue.bookings().stream().filter(b -> seeded.contains(b.id())).toList();
        assertThat(mine).extracting(BookingResponse::id).containsExactlyInAnyOrder(d.b1.getId(), d.b6.getId());
        // every returned row (including any leftovers from other tests) has >=1 overdue installment and is ACTIVE
        assertThat(overdue.bookings()).allSatisfy(b -> {
            assertThat(b.status()).isEqualTo(BookingStatus.ACTIVE);
            assertThat(b.installments()).anyMatch(EmiInstallmentResponse::overdue);
        });
    }

    @Test
    void loadsInstallmentsForTheWholePageInExactlyOneQuery() {
        AdminBookingPageResponse page = service.list(null, null, null, d.p1, false, 0, 50);
        assertThat(page.bookings()).hasSize(4);
        verify(installments, times(1)).findByBookingIdInOrderByInstallmentNumberAsc(anyCollection());
        verify(installments, never()).findByBookingIdOrderByInstallmentNumberAsc(any());
    }

    @Test
    void anEmptyPageSkipsTheInstallmentQueryAndReturnsZeroTotal() {
        AdminBookingPageResponse page = service.list(null, UUID.randomUUID(), null, null, false, 0, 20);
        assertThat(page.bookings()).isEmpty();
        assertThat(page.totalElements()).isZero();
        assertThat(page.page()).isZero();
        assertThat(page.size()).isEqualTo(20);
        verify(installments, never()).findByBookingIdInOrderByInstallmentNumberAsc(anyCollection());
    }

    @Test
    void pageEnvelopeEchoesPageSizeAndTrueTotal() {
        AdminBookingPageResponse page = service.list(null, null, null, d.p2, false, 1, 3);
        assertThat(page.page()).isEqualTo(1);
        assertThat(page.size()).isEqualTo(3);
        assertThat(page.totalElements()).isEqualTo(4);
        assertThat(page.bookings()).hasSize(1);
        assertThat(page.bookings().get(0).id()).isEqualTo(d.b4.getId());
    }

    // The production sort (not the repository test's own Sort) must be booked_at DESC, id DESC:
    // b6/b7 share booked_at (fixed ids 6 < 7), so b7 comes first, and paging splits them stably.
    @Test
    void sameBookedAtTiesBreakByIdDescendingAcrossPages() {
        assertThat(ids(service.list(null, null, null, d.p2, false, 0, 50)))
            .containsExactly(d.b7.getId(), d.b6.getId(), d.b5.getId(), d.b4.getId());
        assertThat(ids(service.list(null, null, null, d.p2, false, 0, 1))).containsExactly(d.b7.getId());
        assertThat(ids(service.list(null, null, null, d.p2, false, 1, 1))).containsExactly(d.b6.getId());
    }
}
