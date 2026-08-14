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
            bookingId, UUID.randomUUID(), associateId, new BigDecimal("600000.00"), 1, Instant.now(),
            List.of(new EmiInstallmentResponse(1, new BigDecimal("600000.00"), LocalDate.now().plusMonths(1))));
        AssociateBookingPageResponse page = new AssociateBookingPageResponse(List.of(booking), 0, 20, 1);
        when(bookingService.getMyBookings(eq(associateId), eq(0), eq(20))).thenReturn(page);

        mockMvc.perform(get("/api/associates/me/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.bookings[0].id").value(bookingId.toString()))
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
}
