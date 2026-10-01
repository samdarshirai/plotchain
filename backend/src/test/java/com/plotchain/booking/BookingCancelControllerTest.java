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
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BookingCancelControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @MockBean AssociateRepository associateRepository;
    @MockBean BookingService bookingService;

    private String tokenFor(UUID id, AssociateRole role) {
        Associate a = new Associate();
        a.setId(id);
        a.setRole(role);
        when(associateRepository.findById(id)).thenReturn(Optional.of(a));
        return jwtService.generateToken(a);
    }

    private org.springframework.test.web.servlet.ResultActions cancel(UUID bookingId, String adminTokenFor, String body) throws Exception {
        return mockMvc.perform(post("/api/admin/bookings/{id}/cancel", bookingId)
            .header("Authorization", "Bearer " + adminTokenFor)
            .contentType("application/json").content(body));
    }

    @Test
    void cancelReturns200WithTheUpdatedBookingAndPassesTheActorAndReason() throws Exception {
        UUID actor = UUID.randomUUID();
        UUID bookingId = UUID.randomUUID();
        BookingResponse response = new BookingResponse(bookingId, UUID.randomUUID(), UUID.randomUUID(),
            BookingStatus.CANCELLED, "Jane Buyer", new BigDecimal("600000.00"), 1, Instant.now(),
            BigDecimal.ZERO, BigDecimal.ZERO, List.of());
        when(bookingService.cancelBooking(eq(bookingId), eq(new CancelBookingRequest("changed mind")), eq(actor)))
            .thenReturn(response);

        cancel(bookingId, tokenFor(actor, AssociateRole.ADMIN), "{\"reason\":\"changed mind\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CANCELLED"));
    }

    @Test
    void cancelOfAnUnknownBookingIs404() throws Exception {
        UUID id = UUID.randomUUID();
        when(bookingService.cancelBooking(eq(id), any(), any())).thenThrow(new BookingNotFoundException(id));
        cancel(id, tokenFor(UUID.randomUUID(), AssociateRole.ADMIN), "{\"reason\":\"x\"}")
            .andExpect(status().isNotFound());
    }

    @Test
    void cancelOfANonActiveBookingIs409() throws Exception {
        UUID id = UUID.randomUUID();
        when(bookingService.cancelBooking(eq(id), any(), any())).thenThrow(new BookingNotActiveException(id));
        cancel(id, tokenFor(UUID.randomUUID(), AssociateRole.ADMIN), "{\"reason\":\"x\"}")
            .andExpect(status().isConflict());
    }

    @Test
    void cancelWithABlankMissingOrOversizedReasonIs400AndNeverReachesTheService() throws Exception {
        String token = tokenFor(UUID.randomUUID(), AssociateRole.ADMIN);
        UUID id = UUID.randomUUID();
        cancel(id, token, "{\"reason\":\"\"}").andExpect(status().isBadRequest());
        cancel(id, token, "{\"reason\":\"   \"}").andExpect(status().isBadRequest());
        cancel(id, token, "{}").andExpect(status().isBadRequest());
        cancel(id, token, "{\"reason\":null}").andExpect(status().isBadRequest());
        cancel(id, token, "{\"reason\":\"" + "x".repeat(256) + "\"}").andExpect(status().isBadRequest());
        cancel(id, token, "").andExpect(status().isBadRequest());           // no body at all
        verify(bookingService, never()).cancelBooking(any(), any(), any());
    }

    @Test
    void cancelWithAReasonOfExactly255CharactersIsAccepted() throws Exception {
        UUID id = UUID.randomUUID();
        when(bookingService.cancelBooking(eq(id), any(), any())).thenThrow(new BookingNotFoundException(id));
        cancel(id, tokenFor(UUID.randomUUID(), AssociateRole.ADMIN), "{\"reason\":\"" + "x".repeat(255) + "\"}")
            .andExpect(status().isNotFound());                              // got past validation
    }

    @Test
    void cancelIsForbiddenForAnAssociateTokenAndUnauthorizedWithoutOne() throws Exception {
        UUID id = UUID.randomUUID();
        cancel(id, tokenFor(UUID.randomUUID(), AssociateRole.ASSOCIATE), "{\"reason\":\"x\"}")
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/admin/bookings/{id}/cancel", id).contentType("application/json")
            .content("{\"reason\":\"x\"}")).andExpect(status().isUnauthorized());
        verify(bookingService, never()).cancelBooking(any(), any(), any());
    }
}
