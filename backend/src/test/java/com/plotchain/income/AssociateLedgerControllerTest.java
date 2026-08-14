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

// MockMvc + real JWT via JwtService, mirroring LedgerControllerTest's and
// AssociateSaleControllerTest's shape -- the real Spring Security filter chain runs, so this also
// proves the 401 case end to end. SecurityConfigTest additionally covers reachability by an
// ordinary associate token across the full route matrix; this file focuses on this controller's
// own request/response shape and the "always the caller's own id" guarantee.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateLedgerControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean LedgerService ledgerService;

    // Unlike a role-only tokenFor(role) (which mints a random associateId per call), this test
    // needs to know the associateId ahead of time -- it's how we prove
    // AssociateLedgerController resolves the caller's OWN id from the JWT, not from a request
    // parameter (this endpoint accepts none).
    private String tokenFor(AssociateRole role, UUID associateId) {
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(role);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void getMyLedgerReturns200WithFiltersAndTheCallersOwnAssociateId() throws Exception {
        UUID associateId = UUID.randomUUID();
        UUID entryId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        AssociateLedgerEntryResponse row = new AssociateLedgerEntryResponse(
            entryId, IncomeType.DIRECT, cycleId,
            LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 15),
            new BigDecimal("100.00"), new BigDecimal("5.00"), new BigDecimal("4.00"), new BigDecimal("91.00"),
            LedgerEntryStatus.PAID, UUID.randomUUID(), Instant.now());
        AssociateLedgerPageResponse page = new AssociateLedgerPageResponse(List.of(row), 0, 20, 1);
        when(ledgerService.myList(
            eq(associateId), eq(IncomeType.DIRECT), eq(cycleId), eq(LedgerEntryStatus.PAID), eq(0), eq(20)))
            .thenReturn(page);

        mockMvc.perform(get("/api/associates/me/ledger")
                .param("incomeType", "DIRECT")
                .param("cycleId", cycleId.toString())
                .param("status", "PAID")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].id").value(entryId.toString()))
            .andExpect(jsonPath("$.entries[0].cyclePeriodStart").value("2026-01-01"))
            .andExpect(jsonPath("$.entries[0].cyclePeriodEnd").value("2026-01-15"))
            .andExpect(jsonPath("$.entries[0].associateId").doesNotExist())
            .andExpect(jsonPath("$.entries[0].associateName").doesNotExist())
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void getMyLedgerReturns200WithAnEmptyPageWhenUnfiltered() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(ledgerService.myList(eq(associateId), isNull(), isNull(), isNull(), eq(0), eq(20)))
            .thenReturn(new AssociateLedgerPageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/associates/me/ledger")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries").isEmpty())
            .andExpect(jsonPath("$.totalElements").value(0));
    }

    // Proves the endpoint has no associateId request parameter at all: passing one is simply
    // ignored by Spring MVC (no matching @RequestParam to bind to), so the service is still
    // called with the JWT-derived id, never the query-string value.
    @Test
    void getMyLedgerIgnoresAnAssociateIdQueryParameterIfOnePassed() throws Exception {
        UUID callerId = UUID.randomUUID();
        UUID otherAssociateId = UUID.randomUUID();
        when(ledgerService.myList(eq(callerId), isNull(), isNull(), isNull(), eq(0), eq(20)))
            .thenReturn(new AssociateLedgerPageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/associates/me/ledger")
                .param("associateId", otherAssociateId.toString())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, callerId)))
            .andExpect(status().isOk());

        verify(ledgerService).myList(eq(callerId), isNull(), isNull(), isNull(), eq(0), eq(20));
    }

    @Test
    void getMyLedgerClampsAnOversizedPageSizeToTheServerSideMaximum() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(ledgerService.myList(eq(associateId), isNull(), isNull(), isNull(), eq(0), eq(100)))
            .thenReturn(new AssociateLedgerPageResponse(List.of(), 0, 100, 0));

        mockMvc.perform(get("/api/associates/me/ledger").param("size", "999999")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk());

        verify(ledgerService).myList(eq(associateId), isNull(), isNull(), isNull(), eq(0), eq(100));
    }

    @Test
    void getMyLedgerClampsANegativePageToZeroInsteadOfThrowing() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(ledgerService.myList(eq(associateId), isNull(), isNull(), isNull(), eq(0), eq(20)))
            .thenReturn(new AssociateLedgerPageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/associates/me/ledger").param("page", "-5")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk());

        verify(ledgerService).myList(eq(associateId), isNull(), isNull(), isNull(), eq(0), eq(20));
    }

    @Test
    void getMyLedgerReturns400ForAnInvalidIncomeTypeValue() throws Exception {
        UUID associateId = UUID.randomUUID();
        mockMvc.perform(get("/api/associates/me/ledger").param("incomeType", "NOT_A_TYPE")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid value for incomeType"));
    }

    @Test
    void getMyLedgerReturns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/ledger"))
            .andExpect(status().isUnauthorized());
    }
}
