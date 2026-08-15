package com.plotchain.withdrawal;

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

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// MockMvc + real JWT via JwtService, mirroring income.AssociateLedgerControllerTest's shape --
// the real Spring Security filter chain runs, so this also proves the 401 case end to end.
// SecurityConfigTest additionally covers reachability by an ordinary associate token; this file
// focuses on this controller's own request/response shape and the "always the caller's own id"
// guarantee.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateWithdrawalControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean WithdrawalService withdrawalService;

    // Unlike a role-only tokenFor(role) (which mints a random associateId per call), this test
    // needs to know the associateId ahead of time -- it's how we prove
    // AssociateWithdrawalController resolves the caller's OWN id from the JWT, not from a
    // request parameter (this endpoint accepts none).
    private String tokenFor(AssociateRole role, UUID associateId) {
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(role);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void getMyWithdrawalsReturns200WithFiltersAndTheCallersOwnAssociateId() throws Exception {
        UUID associateId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        AssociateWithdrawalResponse row = new AssociateWithdrawalResponse(
            requestId, new BigDecimal("1000.00"), WithdrawalRequestStatus.DISBURSED,
            null, "BANK-REF-001", Instant.now(), Instant.now(), Instant.now());
        AssociateWithdrawalPageResponse page = new AssociateWithdrawalPageResponse(List.of(row), 0, 20, 1);
        when(withdrawalService.myList(eq(associateId), eq(WithdrawalRequestStatus.DISBURSED), eq(0), eq(20)))
            .thenReturn(page);

        mockMvc.perform(get("/api/associates/me/withdrawals")
                .param("status", "DISBURSED")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.requests[0].id").value(requestId.toString()))
            .andExpect(jsonPath("$.requests[0].status").value("DISBURSED"))
            .andExpect(jsonPath("$.requests[0].bankReference").value("BANK-REF-001"))
            .andExpect(jsonPath("$.requests[0].associateId").doesNotExist())
            .andExpect(jsonPath("$.requests[0].associateUserId").doesNotExist())
            .andExpect(jsonPath("$.requests[0].associateName").doesNotExist())
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void getMyWithdrawalsReturns200WithAnEmptyPageWhenUnfiltered() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(withdrawalService.myList(eq(associateId), isNull(), eq(0), eq(20)))
            .thenReturn(new AssociateWithdrawalPageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/associates/me/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.requests").isEmpty())
            .andExpect(jsonPath("$.totalElements").value(0));
    }

    // Proves the endpoint has no associateId request parameter at all: passing one is simply
    // ignored by Spring MVC (no matching @RequestParam to bind to), so the service is still
    // called with the JWT-derived id, never the query-string value. This is the acceptance
    // criterion "never returns another associate's rows regardless of filter values passed."
    @Test
    void getMyWithdrawalsIgnoresAnAssociateIdQueryParameterIfOnePassed() throws Exception {
        UUID callerId = UUID.randomUUID();
        UUID otherAssociateId = UUID.randomUUID();
        when(withdrawalService.myList(eq(callerId), isNull(), eq(0), eq(20)))
            .thenReturn(new AssociateWithdrawalPageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/associates/me/withdrawals")
                .param("associateId", otherAssociateId.toString())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, callerId)))
            .andExpect(status().isOk());

        verify(withdrawalService).myList(eq(callerId), isNull(), eq(0), eq(20));
    }

    @Test
    void getMyWithdrawalsClampsAnOversizedPageSizeToTheServerSideMaximum() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(withdrawalService.myList(eq(associateId), isNull(), eq(0), eq(100)))
            .thenReturn(new AssociateWithdrawalPageResponse(List.of(), 0, 100, 0));

        mockMvc.perform(get("/api/associates/me/withdrawals").param("size", "999999")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk());

        verify(withdrawalService).myList(eq(associateId), isNull(), eq(0), eq(100));
    }

    @Test
    void getMyWithdrawalsClampsANegativePageToZeroInsteadOfThrowing() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(withdrawalService.myList(eq(associateId), isNull(), eq(0), eq(20)))
            .thenReturn(new AssociateWithdrawalPageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/associates/me/withdrawals").param("page", "-5")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk());

        verify(withdrawalService).myList(eq(associateId), isNull(), eq(0), eq(20));
    }

    @Test
    void getMyWithdrawalsReturns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/withdrawals"))
            .andExpect(status().isUnauthorized());
    }
}
