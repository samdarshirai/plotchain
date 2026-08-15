package com.plotchain.withdrawal;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatus;
import com.plotchain.associate.KycStatus;
import com.plotchain.auth.JwtService;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.payments.WithdrawalConfig;
import com.plotchain.payments.WithdrawalConfigRepository;
import com.plotchain.wallet.WalletRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @SpringBootTest + real Spring Security filter chain, mirroring KycReviewControllerTest's
// pattern -- proves auth/validation/exception-mapping wiring end to end. Business-logic branch
// coverage (every guard clause, auto-approval math) lives in WithdrawalServiceTest; this class
// only needs one representative case per HTTP outcome.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class WithdrawalControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean WalletRepository walletRepository;
    @MockBean WithdrawalConfigRepository withdrawalConfigRepository;
    @MockBean WithdrawalRequestRepository withdrawalRequestRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;

    private static final UUID TARGET_ASSOCIATE_ID = UUID.randomUUID();

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    private Associate verifiedActiveAssociate() {
        Associate associate = new Associate();
        associate.setId(TARGET_ASSOCIATE_ID);
        associate.setUserId("VP00001");
        associate.setName("Jane Doe");
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setStatus(AssociateStatus.ACTIVE);
        associate.setKycStatus(KycStatus.VERIFIED);
        return associate;
    }

    private void stubAlwaysManualNoMinimum() {
        WithdrawalConfig config = new WithdrawalConfig();
        config.setApprovalMode("ALWAYS_MANUAL");
        config.setMinimumWithdrawalAmount(BigDecimal.ZERO);
        when(withdrawalConfigRepository.findAll()).thenReturn(List.of(config));
    }

    @Test
    void submitReturns201AndTheCreatedRequestForAnAdminToken() throws Exception {
        when(associateRepository.findById(TARGET_ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        stubAlwaysManualNoMinimum();
        when(walletRepository.debitIfSufficient(TARGET_ASSOCIATE_ID, new BigDecimal("1000.00"))).thenReturn(1);
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        String body = new ObjectMapper().writeValueAsString(new CreateWithdrawalRequest(TARGET_ASSOCIATE_ID, new BigDecimal("1000.00")));

        mockMvc.perform(post("/api/admin/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("REQUESTED"))
            .andExpect(jsonPath("$.associateUserId").value("VP00001"));
    }

    @Test
    void submitIsForbiddenForAnAssociateToken() throws Exception {
        String body = new ObjectMapper().writeValueAsString(new CreateWithdrawalRequest(TARGET_ASSOCIATE_ID, new BigDecimal("1000.00")));

        mockMvc.perform(post("/api/admin/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isForbidden());
    }

    @Test
    void submitReturns400WhenAmountIsNotPositive() throws Exception {
        String body = new ObjectMapper().writeValueAsString(new CreateWithdrawalRequest(TARGET_ASSOCIATE_ID, BigDecimal.ZERO));

        mockMvc.perform(post("/api/admin/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fields.amount").isNotEmpty());
    }

    @Test
    void submitReturns404ForAnUnknownAssociate() throws Exception {
        when(associateRepository.findById(TARGET_ASSOCIATE_ID)).thenReturn(Optional.empty());
        String body = new ObjectMapper().writeValueAsString(new CreateWithdrawalRequest(TARGET_ASSOCIATE_ID, new BigDecimal("1000.00")));

        mockMvc.perform(post("/api/admin/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isNotFound());
    }

    @Test
    void submitReturns409ForASuspendedAssociate() throws Exception {
        Associate suspended = verifiedActiveAssociate();
        suspended.setStatus(AssociateStatus.SUSPENDED);
        when(associateRepository.findById(TARGET_ASSOCIATE_ID)).thenReturn(Optional.of(suspended));
        String body = new ObjectMapper().writeValueAsString(new CreateWithdrawalRequest(TARGET_ASSOCIATE_ID, new BigDecimal("1000.00")));

        mockMvc.perform(post("/api/admin/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isConflict());
    }

    @Test
    void submitReturns409WhenWalletBalanceIsInsufficient() throws Exception {
        when(associateRepository.findById(TARGET_ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        stubAlwaysManualNoMinimum();
        when(walletRepository.debitIfSufficient(TARGET_ASSOCIATE_ID, new BigDecimal("1000.00"))).thenReturn(0);
        String body = new ObjectMapper().writeValueAsString(new CreateWithdrawalRequest(TARGET_ASSOCIATE_ID, new BigDecimal("1000.00")));

        mockMvc.perform(post("/api/admin/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isConflict());
    }

    @Test
    void listReturns200WithFilters() throws Exception {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = new WithdrawalRequest();
        request.setId(requestId);
        request.setAssociateId(TARGET_ASSOCIATE_ID);
        request.setAmount(new BigDecimal("1000.00"));
        request.setStatus(WithdrawalRequestStatus.REQUESTED);
        request.setRequestedAt(java.time.Instant.now());
        Associate associate = verifiedActiveAssociate();

        when(withdrawalRequestRepository.search(
            eq(TARGET_ASSOCIATE_ID), eq(WithdrawalRequestStatus.REQUESTED), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(request), PageRequest.of(0, 20), 1));
        when(associateRepository.findAllById(List.of(TARGET_ASSOCIATE_ID))).thenReturn(List.of(associate));

        mockMvc.perform(get("/api/admin/withdrawals")
                .param("associateId", TARGET_ASSOCIATE_ID.toString())
                .param("status", "REQUESTED")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.requests[0].id").value(requestId.toString()))
            .andExpect(jsonPath("$.requests[0].associateUserId").value("VP00001"))
            .andExpect(jsonPath("$.requests[0].associateName").value("Jane Doe"))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void listReturns200WithAnEmptyPageWhenUnfiltered() throws Exception {
        when(withdrawalRequestRepository.search(isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/admin/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.requests").isEmpty())
            .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void listClampsAnOversizedPageSizeToTheServerSideMaximum() throws Exception {
        when(withdrawalRequestRepository.search(isNull(), isNull(), eq(PageRequest.of(0, 100))))
            .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/admin/withdrawals").param("size", "999999")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.size").value(100));
    }

    @Test
    void listClampsANegativePageToZeroInsteadOfThrowing() throws Exception {
        when(withdrawalRequestRepository.search(isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/admin/withdrawals").param("page", "-5")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.page").value(0));
    }

    @Test
    void listIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void listIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/admin/withdrawals"))
            .andExpect(status().isUnauthorized());
    }
}
