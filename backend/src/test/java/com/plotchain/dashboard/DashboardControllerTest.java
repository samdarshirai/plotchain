package com.plotchain.dashboard;

import com.plotchain.announcement.AnnouncementRepository;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.auth.JwtService;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
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
    @MockBean AnnouncementRepository announcementRepository;

    private String tokenFor(UUID associateId) {
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(AssociateRole.ASSOCIATE);
        return jwtService.generateToken(associate);
    }

    private String tokenForActiveAssociate(UUID associateId, Associate associate) {
        // Configure the mock to return this ACTIVE associate when queried during filter authentication
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
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
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);

        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setStatus(CycleStatus.OPEN);
        cycle.setPeriodStart(LocalDate.now().minusDays(5));
        cycle.setPeriodEnd(LocalDate.now().plusDays(10));

        RankTier currentRank = new RankTier(currentRankId, "Sales Associate", 1, BigDecimal.valueOf(5000));

        // Set up mock for both filter and DashboardService
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.of(cycle));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(any(), any(), any())).thenReturn(BigDecimal.ZERO);
        when(ledgerEntryRepository.sumNetAmountByAssociateAndCycle(any(), any())).thenReturn(BigDecimal.ZERO);
        when(legVolumeRepository.findByAssociateIdAndCycleId(any(), any()))
            .thenReturn(Optional.of(LegVolume.empty(associateId, cycleId)));
        when(walletRepository.findById(associateId)).thenReturn(Optional.of(Wallet.zero(associateId)));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(currentRank));
        when(associateRepository.countDownline(any())).thenReturn(12L);
        when(associateRepository.countActiveToday(any(), any())).thenReturn(3L);
        when(associateRepository.countJoinedBetween(any(), any(), any())).thenReturn(2L);
        when(announcementRepository.findTop5ByOrderByPublishedAtDesc()).thenReturn(List.of());

        mockMvc.perform(get("/api/associates/me/dashboard")
                .header("Authorization", "Bearer " + tokenFor(associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.teamSnapshot.totalDownline").value(12));
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
