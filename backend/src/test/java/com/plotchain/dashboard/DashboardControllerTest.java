package com.plotchain.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DashboardControllerTest {

    @Autowired MockMvc mockMvc;
    @MockBean DashboardService dashboardService;

    @Test
    void returnsDashboardJsonForKnownAssociate() throws Exception {
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        DashboardResponse response = new DashboardResponse(
            true,
            new DashboardResponse.CycleIncome(cycleId, BigDecimal.valueOf(1000), BigDecimal.valueOf(500), BigDecimal.valueOf(1500)),
            new DashboardResponse.WalletSummary(BigDecimal.valueOf(2500)),
            new DashboardResponse.LegVolumeSummary(BigDecimal.valueOf(3000), BigDecimal.valueOf(2000), BigDecimal.ZERO, BigDecimal.valueOf(1000), BigDecimal.valueOf(140)),
            new DashboardResponse.RankProgress("Sales Associate", 1, "Sales Executive", 40, BigDecimal.valueOf(6000)),
            new DashboardResponse.TeamSnapshot(12, 3, 2),
            new DashboardResponse.CycleCountdown(cycleId, 10),
            List.of()
        );
        when(dashboardService.getDashboard(associateId)).thenReturn(response);

        mockMvc.perform(get("/api/associates/{associateId}/dashboard", associateId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.kycPendingBannerVisible").value(true))
            .andExpect(jsonPath("$.cycleIncome.directIncome").value(1000))
            .andExpect(jsonPath("$.teamSnapshot.totalDownline").value(12));
    }

    @Test
    void returns404WhenAssociateNotFound() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(dashboardService.getDashboard(associateId))
            .thenThrow(new com.plotchain.associate.AssociateNotFoundException(associateId));

        mockMvc.perform(get("/api/associates/{associateId}/dashboard", associateId))
            .andExpect(status().isNotFound());
    }

    @Test
    void returns409WhenNoOpenCycle() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(dashboardService.getDashboard(associateId))
            .thenThrow(new com.plotchain.cycle.NoOpenCycleException());

        mockMvc.perform(get("/api/associates/{associateId}/dashboard", associateId))
            .andExpect(status().isConflict());
    }
}
