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

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// reference-gap U4: HTTP contract of POST /api/admin/bookings/{id}/reschedule.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BookingRescheduleControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @MockBean AssociateRepository associateRepository;
    @MockBean BookingService bookingService;

    private String tokenFor(UUID id, AssociateRole role) {
        Associate a = new Associate();
        a.setId(id);
        a.setRole(role);
        when(associateRepository.findById(id)).thenReturn(Optional.of(a));
        return "Bearer " + jwtService.generateToken(a);
    }

    private static String body(String count, String date) {
        return "{" + (count == null ? "" : "\"installmentCount\":" + count) + (count != null && date != null ? "," : "")
            + (date == null ? "" : "\"firstDueDate\":" + date) + "}";
    }

    private static final String OK_BODY = body("3", "\"2026-11-05\"");

    private org.springframework.test.web.servlet.ResultActions call(UUID id, String auth, String json) throws Exception {
        return mockMvc.perform(post("/api/admin/bookings/{id}/reschedule", id)
            .header("Authorization", auth).contentType("application/json").content(json));
    }

    @Test
    void adminValidBodyReturns200AndPassesAdminAsActor() throws Exception {
        UUID bookingId = UUID.randomUUID(), adminId = UUID.randomUUID();
        BookingResponse updated = new BookingResponse(bookingId, UUID.randomUUID(), UUID.randomUUID(),
            BookingStatus.ACTIVE, "Jane Buyer", new BigDecimal("600000.00"), 3, Instant.now(),
            BigDecimal.ZERO, new BigDecimal("600000.00"), List.of());
        when(bookingService.rescheduleBooking(bookingId, new RescheduleRequest(3, LocalDate.of(2026, 11, 5)), adminId))
            .thenReturn(updated);

        call(bookingId, tokenFor(adminId, AssociateRole.ADMIN), OK_BODY)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(bookingId.toString()));
        verify(bookingService).rescheduleBooking(eq(bookingId), eq(new RescheduleRequest(3, LocalDate.of(2026, 11, 5))), eq(adminId));
    }

    @Test
    void badBodiesAre400AndNeverReachTheService() throws Exception {
        String admin = tokenFor(UUID.randomUUID(), AssociateRole.ADMIN);
        for (String json : new String[] {
            body("0", "\"2026-11-05\""), body("61", "\"2026-11-05\""), body("3", null), body("3", "\"not-a-date\"")}) {
            call(UUID.randomUUID(), admin, json).andExpect(status().isBadRequest());
        }
        verifyNoInteractions(bookingService);
    }

    @Test
    void serviceExceptionsMapToTheContractStatuses() throws Exception {
        String admin = tokenFor(UUID.randomUUID(), AssociateRole.ADMIN);
        UUID notActive = UUID.randomUUID(), nothing = UUID.randomUUID(), invalid = UUID.randomUUID(), missing = UUID.randomUUID();
        when(bookingService.rescheduleBooking(eq(notActive), any(), any())).thenThrow(new BookingNotActiveException(notActive));
        when(bookingService.rescheduleBooking(eq(nothing), any(), any())).thenThrow(new NothingToRescheduleException(nothing));
        when(bookingService.rescheduleBooking(eq(invalid), any(), any())).thenThrow(new InvalidRescheduleException("First due date must be today or later"));
        when(bookingService.rescheduleBooking(eq(missing), any(), any())).thenThrow(new BookingNotFoundException(missing));

        call(notActive, admin, OK_BODY).andExpect(status().isConflict());
        call(nothing, admin, OK_BODY)
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("NO_REMAINING_BALANCE"));
        call(invalid, admin, OK_BODY)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("First due date must be today or later"));
        call(missing, admin, OK_BODY).andExpect(status().isNotFound());
    }
}
