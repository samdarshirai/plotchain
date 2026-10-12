package com.plotchain.booking;

import com.plotchain.associate.AssociateRepository;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.ProjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class LastEmiRepositoryTest {

    static final LocalDate MIN = LocalDate.of(1900, 1, 1);
    static final LocalDate MAX = LocalDate.of(9999, 12, 31);

    @Autowired PlotBookingRepository bookings;
    @Autowired EmiInstallmentRepository installments;
    @Autowired AssociateRepository associates;
    @Autowired ProjectRepository projects;
    @Autowired PlotRepository plots;

    BookingRegisterTestData d;

    @BeforeEach
    void seed() {
        d = new BookingRegisterTestData(associates, projects, plots, bookings, installments).seed();
    }

    private static List<UUID> ids(List<LastEmiHead> heads) {
        return heads.stream().map(LastEmiHead::bookingId).toList();
    }

    @Test
    void rangeIsInclusiveAtBothEndsOnTheLastDueDate() {
        List<LastEmiHead> heads = bookings.findLastEmiHeads(LocalDate.of(2026, 6, 15), LocalDate.of(2026, 7, 15), d.p1);
        assertThat(ids(heads)).containsExactly(d.b2.getId(), d.b1.getId());   // 06-15 then 07-15
        assertThat(heads.get(1).lastDueDate()).isEqualTo(LocalDate.of(2026, 7, 15));
    }

    @Test
    void usesTheMaximumDueDateNotAnyInstalment() {
        assertThat(bookings.findLastEmiHeads(LocalDate.of(2026, 6, 10), LocalDate.of(2026, 6, 14), d.p1)).isEmpty();
    }

    @Test
    void cancelledBookingsAreExcluded() {
        List<UUID> found = ids(bookings.findLastEmiHeads(LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 1), d.p2));
        assertThat(found).containsExactlyInAnyOrder(d.b4.getId(), d.b7.getId());
        assertThat(found).doesNotContain(d.b5.getId());
    }

    @Test
    void bookingWithNoInstallmentsNeverAppears() {
        assertThat(ids(bookings.findLastEmiHeads(MIN, MAX, d.p1))).doesNotContain(d.b8.getId());
    }

    @Test
    void nullProjectMeansAllAndOpenDatesMeanNoBound() {
        assertThat(ids(bookings.findLastEmiHeads(MIN, MAX, null)))
            .contains(d.b1.getId(), d.b2.getId(), d.b3.getId(), d.b4.getId(), d.b6.getId(), d.b7.getId())
            .doesNotContain(d.b5.getId(), d.b8.getId());
    }

    @Test
    void rowCarriesLabelsDiscountAndTotal() {
        LastEmiHead h = bookings.findLastEmiHeads(MIN, MAX, d.p1).stream()
            .filter(x -> x.bookingId().equals(d.b1.getId())).findFirst().orElseThrow();
        assertThat(h.associateCode()).isEqualTo(associates.findById(d.a1).orElseThrow().getUserId());
        assertThat(h.associateName()).isEqualTo("Reg Associate");
        assertThat(h.buyerName()).isEqualTo("Buyer 1");
        assertThat(h.projectName()).isEqualTo("Reg P1");
        assertThat(h.plotNo()).isNotBlank();
        assertThat(h.total()).isEqualByComparingTo("600000.00");
        assertThat(h.discount()).isEqualByComparingTo("0");
        assertThat(h.bookedAt()).isEqualTo(d.b1.getBookedAt());
    }
}
