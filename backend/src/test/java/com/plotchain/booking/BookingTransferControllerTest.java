package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatus;
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

import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// plot-booking unit 7: HTTP contract of POST /api/admin/bookings/{id}/transfer.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BookingTransferControllerTest {

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

    private static String body(UUID associateId) { return "{\"associateId\":\"" + associateId + "\"}"; }

    @Test
    void transferReturns200WithTheUpdatedBookingAndPassesTheAdminAsActor() throws Exception {
        UUID bookingId = UUID.randomUUID(), target = UUID.randomUUID(), adminId = UUID.randomUUID();
        BookingResponse updated = new BookingResponse(bookingId, UUID.randomUUID(), target,
            BookingStatus.ACTIVE, "Jane Buyer", new BigDecimal("600000.00"), 1, Instant.now(),
            BigDecimal.ZERO, new BigDecimal("600000.00"), List.of());
        when(bookingService.transferBooking(bookingId, target, adminId)).thenReturn(updated);

        mockMvc.perform(post("/api/admin/bookings/{id}/transfer", bookingId)
                .header("Authorization", "Bearer " + tokenFor(adminId, AssociateRole.ADMIN))
                .contentType("application/json").content(body(target)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(bookingId.toString()))
            .andExpect(jsonPath("$.associateId").value(target.toString()));
    }

    @Test
    void transferMapsServiceExceptionsToTheSpecStatuses() throws Exception {
        String admin = "Bearer " + tokenFor(UUID.randomUUID(), AssociateRole.ADMIN);
        UUID missing = UUID.randomUUID(), notActive = UUID.randomUUID(), same = UUID.randomUUID(),
            noTarget = UUID.randomUUID(), badTarget = UUID.randomUUID(), target = UUID.randomUUID();
        when(bookingService.transferBooking(eq(missing), any(), any())).thenThrow(new BookingNotFoundException(missing));
        when(bookingService.transferBooking(eq(notActive), any(), any())).thenThrow(new BookingNotActiveException(notActive));
        when(bookingService.transferBooking(eq(same), any(), any())).thenThrow(new SameAssociateTransferException(target));
        when(bookingService.transferBooking(eq(noTarget), any(), any())).thenThrow(new AssociateNotFoundException(target));
        when(bookingService.transferBooking(eq(badTarget), any(), any()))
            .thenThrow(new InvalidTransferTargetException(target, AssociateStatus.PENDING));

        for (Object[] c : new Object[][] {{missing, 404}, {notActive, 409}, {same, 400}, {noTarget, 404}, {badTarget, 400}}) {
            mockMvc.perform(post("/api/admin/bookings/{id}/transfer", c[0]).header("Authorization", admin)
                    .contentType("application/json").content(body(target)))
                .andExpect(status().is((Integer) c[1]));
        }
    }

    @Test
    void invalidTargetIs400AndTheMessageNamesTheStatus() throws Exception {
        UUID id = UUID.randomUUID(), target = UUID.randomUUID();
        when(bookingService.transferBooking(eq(id), any(), any()))
            .thenThrow(new InvalidTransferTargetException(target, AssociateStatus.SUSPENDED));
        mockMvc.perform(post("/api/admin/bookings/{id}/transfer", id)
                .header("Authorization", "Bearer " + tokenFor(UUID.randomUUID(), AssociateRole.ADMIN))
                .contentType("application/json").content(body(target)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value(containsString("SUSPENDED")));
    }

    @Test
    void missingOrNullAssociateIdIs400AndNeverReachesTheService() throws Exception {
        String admin = "Bearer " + tokenFor(UUID.randomUUID(), AssociateRole.ADMIN);
        for (String json : new String[] {"{}", "{\"associateId\":null}"}) {
            mockMvc.perform(post("/api/admin/bookings/{id}/transfer", UUID.randomUUID())
                    .header("Authorization", admin).contentType("application/json").content(json))
                .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(bookingService);
    }
}
