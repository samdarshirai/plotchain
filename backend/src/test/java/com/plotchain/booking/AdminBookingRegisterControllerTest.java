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

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminBookingRegisterControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @MockBean AssociateRepository associateRepository;
    @MockBean BookingRegisterService registerService;
    @MockBean BookingService bookingService;

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    private String admin() { return "Bearer " + tokenFor(AssociateRole.ADMIN); }

    @Test
    void noParamsUsesDefaultsAndReturnsTheEnvelope() throws Exception {
        when(registerService.list(any(), any(), any(), any(), eq(false), any(), any(), any(), any(), any(), eq(false), eq(0), eq(20)))
            .thenReturn(new AdminBookingPageResponse(List.of(), 0, 20, 0));
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.bookings").isEmpty())
            .andExpect(jsonPath("$.page").value(0))
            .andExpect(jsonPath("$.size").value(20))
            .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void filtersAreBoundAndForwarded() throws Exception {
        UUID assoc = UUID.randomUUID(), plot = UUID.randomUUID(), project = UUID.randomUUID();
        when(registerService.list(any(), any(), any(), any(), anyBoolean(), any(), any(), any(), any(), any(), anyBoolean(), anyInt(), anyInt()))
            .thenReturn(new AdminBookingPageResponse(List.of(), 2, 5, 0));
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin())
                .param("status", "ACTIVE").param("associateId", assoc.toString())
                .param("plotId", plot.toString()).param("projectId", project.toString())
                .param("overdue", "true").param("page", "2").param("size", "5"))
            .andExpect(status().isOk());
        verify(registerService).list(BookingStatus.ACTIVE, assoc, plot, project, true, null, null, null, null, null, 2, 5);
    }

    @Test
    void overdueFalseOrOmittedMeansNoOverdueFilter() throws Exception {
        when(registerService.list(any(), any(), any(), any(), anyBoolean(), any(), any(), any(), any(), any(), anyBoolean(), anyInt(), anyInt()))
            .thenReturn(new AdminBookingPageResponse(List.of(), 0, 20, 0));
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin()).param("overdue", "false"))
            .andExpect(status().isOk());
        verify(registerService).list(null, null, null, null, false, null, null, null, null, null, 0, 20);
    }

    @Test
    void pageAndSizeAreClamped() throws Exception {
        when(registerService.list(any(), any(), any(), any(), anyBoolean(), any(), any(), any(), any(), any(), anyBoolean(), anyInt(), anyInt()))
            .thenReturn(new AdminBookingPageResponse(List.of(), 0, 100, 0));
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin())
            .param("page", "-3").param("size", "1000")).andExpect(status().isOk());
        verify(registerService).list(null, null, null, null, false, null, null, null, null, null, 0, 100);
    }

    @Test
    void sizeZeroOrNegativeIsClampedToOneNotA500() throws Exception {
        when(registerService.list(any(), any(), any(), any(), anyBoolean(), any(), any(), any(), any(), any(), anyBoolean(), anyInt(), anyInt()))
            .thenReturn(new AdminBookingPageResponse(List.of(), 0, 1, 0));
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin()).param("size", "0"))
            .andExpect(status().isOk());
        verify(registerService).list(null, null, null, null, false, null, null, null, null, null, 0, 1);
    }

    @Test
    void badStatusOrBadUuidIs400() throws Exception {
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin()).param("status", "BOGUS"))
            .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin()).param("associateId", "nope"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void getByIdReturnsTheBooking() throws Exception {
        UUID id = UUID.randomUUID();
        BookingResponse body = org.mockito.Mockito.mock(BookingResponse.class);
        when(bookingService.getBooking(id)).thenReturn(body);
        mockMvc.perform(get("/api/admin/bookings/{id}", id).header("Authorization", admin()))
            .andExpect(status().isOk());
        verify(bookingService).getBooking(id);
    }

    @Test
    void getByIdUnknownIs404WithErrorBody() throws Exception {
        UUID id = UUID.randomUUID();
        when(bookingService.getBooking(id)).thenThrow(new BookingNotFoundException(id));
        mockMvc.perform(get("/api/admin/bookings/{id}", id).header("Authorization", admin()))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").value("Booking not found: " + id));
    }

    @Test
    void getDoesNotCollideWithPostOnTheSamePath() throws Exception {
        // POST still reaches BookingController (validation 400 on an empty body, not 405/ambiguous)
        mockMvc.perform(post("/api/admin/bookings").header("Authorization", admin())
                .contentType("application/json").content("{}"))
            .andExpect(status().isBadRequest());
    }

    private void stubAnyList() {
        when(registerService.list(any(), any(), any(), any(), anyBoolean(), any(), any(), any(), any(), any(), anyBoolean(), anyInt(), anyInt()))
            .thenReturn(new AdminBookingPageResponse(List.of(), 0, 20, 0));
    }

    @Test
    void datesAndQAreBoundAndForwarded() throws Exception {
        stubAnyList();
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin())
                .param("bookedFrom", "2026-06-01").param("bookedTo", "2026-06-30")
                .param("cancelledFrom", "2026-07-01").param("cancelledTo", "2026-07-31").param("q", "VP00"))
            .andExpect(status().isOk());
        verify(registerService).list(null, null, null, null, false, java.time.LocalDate.of(2026, 6, 1),
            java.time.LocalDate.of(2026, 6, 30), java.time.LocalDate.of(2026, 7, 1),
            java.time.LocalDate.of(2026, 7, 31), "VP00", 0, 20);
    }

    @Test
    void bookedFromAfterBookedToIs400() throws Exception {
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin())
                .param("bookedFrom", "2026-06-30").param("bookedTo", "2026-06-01"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void cancelledFromAfterCancelledToIs400() throws Exception {
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin())
                .param("cancelledFrom", "2026-07-30").param("cancelledTo", "2026-07-01"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void malformedDateIs400() throws Exception {
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin()).param("bookedFrom", "not-a-date"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void listSerialisesTheNewFields() throws Exception {
        BookingResponse row = new BookingResponse(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
            BookingStatus.ACTIVE, "Jane", new java.math.BigDecimal("550000.00"), 1, java.time.Instant.now(),
            java.math.BigDecimal.ZERO, new java.math.BigDecimal("550000.00"), List.of(), "A-1", "Proj", "Assoc",
            "9999999999", new java.math.BigDecimal("600000.00"), new java.math.BigDecimal("50000.00"),
            new java.math.BigDecimal("1200.00"), new java.math.BigDecimal("500.00"), null, "VP00001");
        when(registerService.list(any(), any(), any(), any(), anyBoolean(), any(), any(), any(), any(), any(), anyBoolean(), anyInt(), anyInt()))
            .thenReturn(new AdminBookingPageResponse(List.of(row), 0, 20, 1));
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.bookings[0].buyerPhone").value("9999999999"))
            .andExpect(jsonPath("$.bookings[0].listPrice").value(600000.00))
            .andExpect(jsonPath("$.bookings[0].discount").value(50000.00))
            .andExpect(jsonPath("$.bookings[0].areaSqft").value(1200.00))
            .andExpect(jsonPath("$.bookings[0].rate").value(500.00))
            .andExpect(jsonPath("$.bookings[0].associateCode").value("VP00001"))
            .andExpect(jsonPath("$.bookings[0].cancelledAt").value(org.hamcrest.Matchers.nullValue()));
    }
}
