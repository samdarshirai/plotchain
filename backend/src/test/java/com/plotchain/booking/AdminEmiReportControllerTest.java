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
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminEmiReportControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean OverdueReportService overdueReportService;

    private String adminToken() {
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setRole(AssociateRole.ADMIN);
        when(associateRepository.findById(id)).thenReturn(Optional.of(associate));
        return "Bearer " + jwtService.generateToken(associate);
    }

    @Test
    void adminGetsTheReportPageWithAllRowFields() throws Exception {
        UUID bookingId = UUID.randomUUID(), plotId = UUID.randomUUID(), associateId = UUID.randomUUID();
        OverdueReportRow row = new OverdueReportRow(bookingId, plotId, "A-101", associateId, "Asha", "Jane Buyer",
            3, new BigDecimal("600.00"), LocalDate.of(2026, 5, 1));
        when(overdueReportService.getOverdueReport(eq(0), eq(20)))
            .thenReturn(new OverdueReportPageResponse(List.of(row), 0, 20, 1));

        mockMvc.perform(get("/api/admin/emi-reports/overdue").header("Authorization", adminToken()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.rows[0].bookingId").value(bookingId.toString()))
            .andExpect(jsonPath("$.rows[0].plotId").value(plotId.toString()))
            .andExpect(jsonPath("$.rows[0].plotNo").value("A-101"))
            .andExpect(jsonPath("$.rows[0].associateId").value(associateId.toString()))
            .andExpect(jsonPath("$.rows[0].associateName").value("Asha"))
            .andExpect(jsonPath("$.rows[0].buyerName").value("Jane Buyer"))
            .andExpect(jsonPath("$.rows[0].overdueCount").value(3))
            .andExpect(jsonPath("$.rows[0].overdueAmount").value(600.00))
            .andExpect(jsonPath("$.rows[0].oldestDueDate").value("2026-05-01"))
            .andExpect(jsonPath("$.page").value(0))
            .andExpect(jsonPath("$.size").value(20))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void pageAndSizeAreClamped() throws Exception {
        when(overdueReportService.getOverdueReport(eq(0), eq(100)))
            .thenReturn(new OverdueReportPageResponse(List.of(), 0, 100, 0));

        mockMvc.perform(get("/api/admin/emi-reports/overdue").param("page", "-1").param("size", "500")
                .header("Authorization", adminToken()))
            .andExpect(status().isOk());
        verify(overdueReportService).getOverdueReport(0, 100);
    }

    @Test
    void sizeBelowOneIsClampedToOneNotA500() throws Exception {
        when(overdueReportService.getOverdueReport(eq(0), eq(1)))
            .thenReturn(new OverdueReportPageResponse(List.of(), 0, 1, 0));

        mockMvc.perform(get("/api/admin/emi-reports/overdue").param("size", "0")
                .header("Authorization", adminToken()))
            .andExpect(status().isOk());
        verify(overdueReportService).getOverdueReport(0, 1);
    }
}
