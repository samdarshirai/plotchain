package com.plotchain.dashboard;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.auth.JwtService;
import com.plotchain.compensation.RoyaltyBonusRateRepository;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import com.plotchain.sales.SaleRepository;
import com.plotchain.wallet.Wallet;
import com.plotchain.wallet.WalletRepository;
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

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockBean on the 7 repository INTERFACES (not on the concrete DashboardService) so this
// runs a real DashboardService inside a real Spring Security filter chain — proving auth
// actually gates this route — while avoiding the JDK25/ByteBuddy concrete-class-mocking
// issue entirely (interfaces mock fine; see AuthControllerTest/DashboardServiceTest).
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DashboardControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean RankTierRepository rankTierRepository;
    @MockBean CycleRepository cycleRepository;
    @MockBean LedgerEntryRepository ledgerEntryRepository;
    @MockBean LegVolumeRepository legVolumeRepository;
    @MockBean WalletRepository walletRepository;
    @MockBean RoyaltyBonusRateRepository royaltyBonusRateRepository;
    @MockBean SaleRepository saleRepository;

    private String tokenFor(UUID associateId) {
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(AssociateRole.ASSOCIATE);
        return jwtService.generateToken(associate);
    }

    @Test
    void returnsDashboardJsonForTheAuthenticatedAssociate() throws Exception {
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        UUID currentRankId = UUID.randomUUID();

        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(currentRankId);
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setUserId("SDI384818");
        associate.setName("Asha Kumar");
        associate.setPhone("9876543210");
        Instant joinedAt = Instant.now();
        associate.setJoinedAt(joinedAt);

        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setStatus(CycleStatus.OPEN);
        cycle.setPeriodStart(LocalDate.now().minusDays(5));
        cycle.setPeriodEnd(LocalDate.now().plusDays(10));

        RankTier currentRank = new RankTier(currentRankId, "Sales Associate", 1, BigDecimal.valueOf(5000));

        // Set up mock for both filter and DashboardService
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.of(cycle));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(cycleRepository.findAllByOrderByPeriodStartDesc(any(org.springframework.data.domain.PageRequest.class)))
            .thenReturn(org.springframework.data.domain.Page.empty());
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(any(), any(), any())).thenReturn(BigDecimal.ZERO);
        when(ledgerEntryRepository.sumNetAmountByAssociateAndCycle(any(), any())).thenReturn(BigDecimal.ZERO);
        when(royaltyBonusRateRepository.findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(any(), any()))
            .thenReturn(Optional.empty());
        when(walletRepository.findById(associateId)).thenReturn(Optional.of(Wallet.zero(associateId)));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(currentRank));
        when(associateRepository.countDownline(any())).thenReturn(12L);
        when(associateRepository.countByParentId(any())).thenReturn(8L);
        when(associateRepository.countDownlineByKycStatus(any(), any())).thenReturn(0L);
        when(saleRepository.countByAssociateIdAndCycleIdAndStatus(any(), any(), any())).thenReturn(0L);
        when(saleRepository.sumAmountByAssociateIdAndCycleIdAndStatus(any(), any(), any())).thenReturn(BigDecimal.ZERO);

        mockMvc.perform(get("/api/associates/me/dashboard")
                .header("Authorization", "Bearer " + tokenFor(associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.networkSummary.totalDownline").value(12))
            .andExpect(jsonPath("$.networkSummary.directCount").value(8))
            .andExpect(jsonPath("$.associate.name").value("Asha Kumar"))
            .andExpect(jsonPath("$.associate.joinedAt").value(joinedAt.toString()))
            .andExpect(jsonPath("$.cycleIncome.sponsorMatchingIncome").value(0))
            .andExpect(jsonPath("$.cycleIncome.royaltyBonusPct").value(0))
            .andExpect(jsonPath("$.salesSummary.salesThisCycle").value(0))
            .andExpect(jsonPath("$.kycBreakdown.verified").value(0))
            .andExpect(jsonPath("$.legVolumeSummary.leftLegVolume").value(0))
            .andExpect(jsonPath("$.legVolumeSummary.rightLegVolume").value(0));
    }

    @Test
    void returns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/dashboard"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void returns409WhenAssociateHasNoRank() throws Exception {
        UUID associateId = UUID.randomUUID();
        // Configure the associate to be found and active for the filter to pass
        Associate associate = new Associate();
        associate.setId(associateId);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        // Don't set a rank, which causes the service to return 409 Conflict
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());

        mockMvc.perform(get("/api/associates/me/dashboard")
                .header("Authorization", "Bearer " + tokenFor(associateId)))
            .andExpect(status().isConflict());
    }

    @Test
    void returns409WhenNoOpenCycle() throws Exception {
        UUID associateId = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(UUID.randomUUID());
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/associates/me/dashboard")
                .header("Authorization", "Bearer " + tokenFor(associateId)))
            .andExpect(status().isConflict());
    }
}
