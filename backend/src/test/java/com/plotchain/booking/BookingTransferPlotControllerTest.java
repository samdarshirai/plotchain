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

import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// HTTP contract of POST /api/admin/bookings/{id}/transfer-plot.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BookingTransferPlotControllerTest {

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

    private static String body(UUID plotId) { return "{\"plotId\":\"" + plotId + "\"}"; }

    @Test
    void returns200WithUpdatedBooking() throws Exception {
        UUID bookingId = UUID.randomUUID(), plotId = UUID.randomUUID(), adminId = UUID.randomUUID();
        BookingResponse updated = new BookingResponse(bookingId, plotId, UUID.randomUUID(),
            BookingStatus.ACTIVE, "Jane Buyer", new BigDecimal("600000.00"), 1, Instant.now(),
            BigDecimal.ZERO, new BigDecimal("600000.00"), List.of());
        when(bookingService.transferPlot(bookingId, plotId, adminId)).thenReturn(updated);

        mockMvc.perform(post("/api/admin/bookings/{id}/transfer-plot", bookingId)
                .header("Authorization", "Bearer " + tokenFor(adminId, AssociateRole.ADMIN))
                .contentType("application/json").content(body(plotId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plotId").value(plotId.toString()));
    }

    @Test
    void mapsInvalidTransferTo400() throws Exception {
        UUID bookingId = UUID.randomUUID(), plotId = UUID.randomUUID(), adminId = UUID.randomUUID();
        when(bookingService.transferPlot(bookingId, plotId, adminId))
            .thenThrow(new InvalidPlotTransferException("Target plot must be in the same project"));

        mockMvc.perform(post("/api/admin/bookings/{id}/transfer-plot", bookingId)
                .header("Authorization", "Bearer " + tokenFor(adminId, AssociateRole.ADMIN))
                .contentType("application/json").content(body(plotId)))
            .andExpect(status().isBadRequest());
    }

    @Test
    void nonAdminGets403() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(post("/api/admin/bookings/{id}/transfer-plot", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(id, AssociateRole.ASSOCIATE))
                .contentType("application/json").content(body(UUID.randomUUID())))
            .andExpect(status().isForbidden());
        verifyNoInteractions(bookingService);
    }
}
