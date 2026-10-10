package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.ProjectRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Real-DB proof of findByDownline: whole team vs one leg, own/outsider bookings never leak.
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class PlotBookingDownlineRepositoryTest {

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
    void teamIsWholeDownlineAndLegsAreDisjointAndExcludeSelfAndOutsiders() {
        BookingRegisterTestData d = new BookingRegisterTestData(associates, projects, plots, repo, installments);
        UUID project = d.project("Downline P");
        UUID root = d.associate();
        UUID left = child(d, root, "L");
        UUID leftGrandchild = child(d, left, "R");   // deep in the LEFT leg regardless of own position
        UUID right = child(d, root, "R");
        UUID outsider = d.associate();

        PlotBooking own = d.booking(root, project, BookingStatus.ACTIVE, 1);
        PlotBooking bl = d.booking(left, project, BookingStatus.ACTIVE, 2);
        PlotBooking bg = d.booking(leftGrandchild, project, BookingStatus.ACTIVE, 3);
        PlotBooking br = d.booking(right, project, BookingStatus.ACTIVE, 4);
        d.booking(outsider, project, BookingStatus.ACTIVE, 5);

        Page<PlotBooking> team = repo.findByDownline(root, null, PageRequest.of(0, 50));
        assertThat(team.getContent()).extracting(PlotBooking::getId)
            .containsExactly(br.getId(), bg.getId(), bl.getId());   // newest first, no own, no outsider
        assertThat(team.getTotalElements()).isEqualTo(3);

        assertThat(repo.findByDownline(root, "L", PageRequest.of(0, 50)).getContent())
            .extracting(PlotBooking::getId).containsExactly(bg.getId(), bl.getId());
        assertThat(repo.findByDownline(root, "R", PageRequest.of(0, 50)).getContent())
            .extracting(PlotBooking::getId).containsExactly(br.getId());
        assertThat(own.getId()).isNotIn(team.getContent().stream().map(PlotBooking::getId).toList());
    }
}
