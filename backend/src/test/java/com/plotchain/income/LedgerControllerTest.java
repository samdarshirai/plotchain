package com.plotchain.income;

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

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// MockMvc + real JWT via JwtService, mirroring KycReviewControllerTest's and
// SaleControllerTest's shape -- the real Spring Security filter chain runs, so this also proves
// the 403/401 cases end to end, not just the 200 case. SecurityConfigTest additionally covers the
// full ADMIN-vs-every-other-role matrix (Task 3, Step 5 below); this file focuses on this
// controller's own request/response shape.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class LedgerControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean LedgerService ledgerService;

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void listReturns200WithFilters() throws Exception {
        UUID entryId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        AdminLedgerEntryResponse row = new AdminLedgerEntryResponse(
            entryId, associateId, "VP00001", "Jane Doe", IncomeType.DIRECT, cycleId,
            LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 15),
            new BigDecimal("100.00"), new BigDecimal("5.00"), new BigDecimal("4.00"), new BigDecimal("91.00"),
            LedgerEntryStatus.PAID, UUID.randomUUID(), Instant.now());
        AdminLedgerPageResponse page = new AdminLedgerPageResponse(List.of(row), 0, 20, 1);
        when(ledgerService.adminList(
            eq(associateId), eq(IncomeType.DIRECT), eq(cycleId), eq(LedgerEntryStatus.PAID), eq(0), eq(20)))
            .thenReturn(page);

        mockMvc.perform(get("/api/admin/ledger")
                .param("associateId", associateId.toString())
                .param("incomeType", "DIRECT")
                .param("cycleId", cycleId.toString())
                .param("status", "PAID")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].id").value(entryId.toString()))
            .andExpect(jsonPath("$.entries[0].associateUserId").value("VP00001"))
            .andExpect(jsonPath("$.entries[0].associateName").value("Jane Doe"))
            .andExpect(jsonPath("$.entries[0].cyclePeriodStart").value("2026-01-01"))
            .andExpect(jsonPath("$.entries[0].cyclePeriodEnd").value("2026-01-15"))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void listReturns200WithAnEmptyPageWhenUnfiltered() throws Exception {
        when(ledgerService.adminList(isNull(), isNull(), isNull(), isNull(), eq(0), eq(20)))
            .thenReturn(new AdminLedgerPageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/admin/ledger")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries").isEmpty())
            .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void listClampsAnOversizedPageSizeToTheServerSideMaximum() throws Exception {
        when(ledgerService.adminList(isNull(), isNull(), isNull(), isNull(), eq(0), eq(100)))
            .thenReturn(new AdminLedgerPageResponse(List.of(), 0, 100, 0));

        mockMvc.perform(get("/api/admin/ledger").param("size", "999999")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        verify(ledgerService).adminList(isNull(), isNull(), isNull(), isNull(), eq(0), eq(100));
    }

    @Test
    void listClampsANegativePageToZeroInsteadOfThrowing() throws Exception {
        when(ledgerService.adminList(isNull(), isNull(), isNull(), isNull(), eq(0), eq(20)))
            .thenReturn(new AdminLedgerPageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/admin/ledger").param("page", "-5")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        verify(ledgerService).adminList(isNull(), isNull(), isNull(), isNull(), eq(0), eq(20));
    }

    @Test
    void listReturns400ForAnInvalidIncomeTypeValue() throws Exception {
        mockMvc.perform(get("/api/admin/ledger").param("incomeType", "NOT_A_TYPE")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid value for incomeType"));
    }

    @Test
    void listReturns400ForAnInvalidUuidInAssociateId() throws Exception {
        mockMvc.perform(get("/api/admin/ledger").param("associateId", "not-a-uuid")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid value for associateId"));
    }

    @Test
    void listIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/ledger")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void listIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/admin/ledger"))
            .andExpect(status().isUnauthorized());
    }
}
