package com.plotchain.cycle;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CycleControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean CycleService cycleService;

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void listReturnsAPageForAnAdminToken() throws Exception {
        UUID cycleId = UUID.randomUUID();
        when(cycleService.list(isNull(), eq(0), eq(20))).thenReturn(
            new CyclePageResponse(
                List.of(new CycleSummaryResponse(cycleId, java.time.LocalDate.of(2026, 7, 1),
                    java.time.LocalDate.of(2026, 7, 15), CycleStatus.OPEN)),
                0, 20, 1));

        mockMvc.perform(get("/api/admin/cycles")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.cycles[0].id").value(cycleId.toString()))
            .andExpect(jsonPath("$.cycles[0].status").value("OPEN"))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void listPassesTheStatusFilterThrough() throws Exception {
        when(cycleService.list(eq(CycleStatus.CLOSED), eq(0), eq(20)))
            .thenReturn(new CyclePageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/admin/cycles").param("status", "CLOSED")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        verify(cycleService).list(CycleStatus.CLOSED, 0, 20);
    }

    @Test
    void listClampsAnOversizedPageSizeToTheServerSideMaximum() throws Exception {
        when(cycleService.list(any(), eq(0), eq(100))).thenReturn(new CyclePageResponse(List.of(), 0, 100, 0));

        mockMvc.perform(get("/api/admin/cycles").param("size", "999999")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        ArgumentCaptor<Integer> sizeCaptor = ArgumentCaptor.forClass(Integer.class);
        verify(cycleService).list(any(), eq(0), sizeCaptor.capture());
        assertThat(sizeCaptor.getValue()).isEqualTo(100);
    }

    @Test
    void listClampsANegativePageToZeroInsteadOfThrowing() throws Exception {
        when(cycleService.list(any(), eq(0), eq(20))).thenReturn(new CyclePageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/admin/cycles").param("page", "-5")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        verify(cycleService).list(any(), eq(0), eq(20));
    }

    @Test
    void detailReturnsTheBreakdownForAnAdminToken() throws Exception {
        UUID cycleId = UUID.randomUUID();
        when(cycleService.getDetail(cycleId)).thenReturn(
            new CycleDetailResponse(cycleId, java.time.LocalDate.of(2026, 7, 1),
                java.time.LocalDate.of(2026, 7, 15), CycleStatus.CLOSED,
                List.of(new CycleIncomeTypeTotal(com.plotchain.income.IncomeType.DIRECT,
                    java.math.BigDecimal.valueOf(100))),
                java.math.BigDecimal.valueOf(100)));

        mockMvc.perform(get("/api/admin/cycles/{id}", cycleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(cycleId.toString()))
            .andExpect(jsonPath("$.status").value("CLOSED"))
            .andExpect(jsonPath("$.incomeTypeTotals[0].incomeType").value("DIRECT"))
            .andExpect(jsonPath("$.incomeTypeTotals[0].totalNet").value(100))
            .andExpect(jsonPath("$.totalNet").value(100));
    }

    @Test
    void detailReturns404WhenTheCycleDoesNotExist() throws Exception {
        UUID cycleId = UUID.randomUUID();
        when(cycleService.getDetail(cycleId)).thenThrow(new CycleNotFoundException(cycleId));

        mockMvc.perform(get("/api/admin/cycles/{id}", cycleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isNotFound());
    }

    @Test
    void closeReturnsTheSettlementResultForAnAdminToken() throws Exception {
        UUID cycleId = UUID.randomUUID();
        UUID newCycleId = UUID.randomUUID();
        when(cycleService.close(cycleId))
            .thenReturn(new CycleCloseResponse(cycleId, CycleStatus.CLOSED, 3, newCycleId));

        mockMvc.perform(post("/api/admin/cycles/{id}/close", cycleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.cycleId").value(cycleId.toString()))
            .andExpect(jsonPath("$.status").value("CLOSED"))
            .andExpect(jsonPath("$.legVolumeRowsWritten").value(3))
            .andExpect(jsonPath("$.newCycleId").value(newCycleId.toString()));
    }

    @Test
    void closeReturns404WhenTheCycleDoesNotExist() throws Exception {
        UUID cycleId = UUID.randomUUID();
        when(cycleService.close(cycleId)).thenThrow(new CycleNotFoundException(cycleId));

        mockMvc.perform(post("/api/admin/cycles/{id}/close", cycleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isNotFound());
    }

    @Test
    void closeReturns409WhenTheCycleIsNotOpen() throws Exception {
        UUID cycleId = UUID.randomUUID();
        when(cycleService.close(cycleId)).thenThrow(new CycleAlreadyClosedException(cycleId));

        mockMvc.perform(post("/api/admin/cycles/{id}/close", cycleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isConflict());
    }
}
