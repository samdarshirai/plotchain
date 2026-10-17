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
import org.springframework.data.domain.PageImpl;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminPlotTransferControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @MockBean AssociateRepository associateRepository;
    @MockBean BookingEventRepository bookingEventRepository;

    private String token(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return "Bearer " + jwtService.generateToken(associate);
    }

    @Test
    void adminGetsEnvelope() throws Exception {
        when(bookingEventRepository.findPlotTransfers(any(), any(), any(), any())).thenReturn(new PageImpl<>(List.of()));
        mockMvc.perform(get("/api/admin/plot-transfers").header("Authorization", token(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.transfers").isEmpty())
            .andExpect(jsonPath("$.size").value(20));
    }

    @Test
    void fromAfterToIs400() throws Exception {
        mockMvc.perform(get("/api/admin/plot-transfers?from=2026-06-02&to=2026-06-01")
                .header("Authorization", token(AssociateRole.ADMIN)))
            .andExpect(status().isBadRequest());
    }

    @Test
    void nonAdminIs403() throws Exception {
        mockMvc.perform(get("/api/admin/plot-transfers").header("Authorization", token(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }
}
