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
        when(registerService.list(any(), any(), any(), any(), eq(false), eq(0), eq(20)))
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
        when(registerService.list(any(), any(), any(), any(), anyBoolean(), anyInt(), anyInt()))
            .thenReturn(new AdminBookingPageResponse(List.of(), 2, 5, 0));
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin())
                .param("status", "ACTIVE").param("associateId", assoc.toString())
                .param("plotId", plot.toString()).param("projectId", project.toString())
                .param("overdue", "true").param("page", "2").param("size", "5"))
            .andExpect(status().isOk());
        verify(registerService).list(BookingStatus.ACTIVE, assoc, plot, project, true, 2, 5);
    }

    @Test
    void overdueFalseOrOmittedMeansNoOverdueFilter() throws Exception {
        when(registerService.list(any(), any(), any(), any(), anyBoolean(), anyInt(), anyInt()))
            .thenReturn(new AdminBookingPageResponse(List.of(), 0, 20, 0));
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin()).param("overdue", "false"))
            .andExpect(status().isOk());
        verify(registerService).list(null, null, null, null, false, 0, 20);
    }

    @Test
    void pageAndSizeAreClamped() throws Exception {
        when(registerService.list(any(), any(), any(), any(), anyBoolean(), anyInt(), anyInt()))
            .thenReturn(new AdminBookingPageResponse(List.of(), 0, 100, 0));
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin())
            .param("page", "-3").param("size", "1000")).andExpect(status().isOk());
        verify(registerService).list(null, null, null, null, false, 0, 100);
    }

    @Test
    void sizeZeroOrNegativeIsClampedToOneNotA500() throws Exception {
        when(registerService.list(any(), any(), any(), any(), anyBoolean(), anyInt(), anyInt()))
            .thenReturn(new AdminBookingPageResponse(List.of(), 0, 1, 0));
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin()).param("size", "0"))
            .andExpect(status().isOk());
        verify(registerService).list(null, null, null, null, false, 0, 1);
    }

    @Test
    void badStatusOrBadUuidIs400() throws Exception {
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin()).param("status", "BOGUS"))
            .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin()).param("associateId", "nope"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void getDoesNotCollideWithPostOnTheSamePath() throws Exception {
        // POST still reaches BookingController (validation 400 on an empty body, not 405/ambiguous)
        mockMvc.perform(post("/api/admin/bookings").header("Authorization", admin())
                .contentType("application/json").content("{}"))
            .andExpect(status().isBadRequest());
    }
}
