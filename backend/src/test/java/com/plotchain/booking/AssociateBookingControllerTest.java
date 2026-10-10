package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateBookingControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean BookingService bookingService;

    private String tokenFor(AssociateRole role, UUID associateId) {
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(role);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void getMyBookingsReturns200WithThePageForTheCallersOwnJwtAssociateId() throws Exception {
        UUID associateId = UUID.randomUUID();
        UUID bookingId = UUID.randomUUID();
        BookingResponse booking = new BookingResponse(
            bookingId, UUID.randomUUID(), associateId, BookingStatus.ACTIVE, "Jane Buyer",
            new BigDecimal("600000.00"), 1, Instant.now(), BigDecimal.ZERO, new BigDecimal("600000.00"),
            List.of(new EmiInstallmentResponse(1, new BigDecimal("600000.00"), LocalDate.now().plusMonths(1),
                InstallmentStatus.PENDING, null, false)));
        AssociateBookingPageResponse page = new AssociateBookingPageResponse(List.of(booking), 0, 20, 1);
        when(bookingService.getMyBookings(eq(associateId), eq(0), eq(20))).thenReturn(page);

        mockMvc.perform(get("/api/associates/me/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.bookings[0].id").value(bookingId.toString()))
            .andExpect(jsonPath("$.bookings[0].status").value("ACTIVE"))
            .andExpect(jsonPath("$.bookings[0].buyerName").value("Jane Buyer"))
            .andExpect(jsonPath("$.bookings[0].paidAmount").value(0))
            .andExpect(jsonPath("$.bookings[0].installments[0].status").value("PENDING"))
            .andExpect(jsonPath("$.bookings[0].installments[0].overdue").value(false))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void getMyBookingsClampsPageAndSizeTheSameWayOtherAssociateMeEndpointsDo() throws Exception {
        UUID associateId = UUID.randomUUID();
        AssociateBookingPageResponse page = new AssociateBookingPageResponse(List.of(), 0, 100, 0);
        when(bookingService.getMyBookings(eq(associateId), eq(0), eq(100))).thenReturn(page);

        mockMvc.perform(get("/api/associates/me/bookings")
                .param("page", "-1")
                .param("size", "500")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.size").value(100));
    }

    @Test
    void getTeamBookingsMapsLegToPositionAndScopesToCallerJwtId() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(bookingService.getTeamBookings(eq(associateId), eq("L"), eq(0), eq(20)))
            .thenReturn(new AssociateBookingPageResponse(List.of(), 0, 20, 0));
        when(bookingService.getTeamBookings(eq(associateId), eq(null), eq(0), eq(20)))
            .thenReturn(new AssociateBookingPageResponse(List.of(), 0, 20, 7));
        String token = tokenFor(AssociateRole.ASSOCIATE, associateId);

        mockMvc.perform(get("/api/associates/me/team-bookings").param("leg", "L")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        mockMvc.perform(get("/api/associates/me/team-bookings")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(7));
    }

    @Test
    void getTeamBookingsRejectsUnknownLeg() throws Exception {
        UUID associateId = UUID.randomUUID();
        mockMvc.perform(get("/api/associates/me/team-bookings").param("leg", "X")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isBadRequest());
    }

    @Test
    void businessReportReturnsLeftAndRightAndPassesDates() throws Exception {
        UUID associateId = UUID.randomUUID();
        BusinessReportRow row = new BusinessReportRow(Instant.parse("2026-06-03T00:00:00Z"), null, "VP00001",
            "Jane", "Proj", "A-1", new BigDecimal("600000.00"));
        when(bookingService.getMyBusiness(associateId, LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 30)))
            .thenReturn(new BusinessReportResponse(List.of(row), List.of()));

        mockMvc.perform(get("/api/associates/me/reports/business")
                .param("from", "2026-06-01").param("to", "2026-06-30")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.left[0].associateId").value("VP00001"))
            .andExpect(jsonPath("$.right").isEmpty());
    }

    @Test
    void reportsRejectFromAfterTo() throws Exception {
        UUID associateId = UUID.randomUUID();
        mockMvc.perform(get("/api/associates/me/reports/emi")
                .param("from", "2026-07-01").param("to", "2026-06-01")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isBadRequest());
    }
}
