package com.plotchain.compensation;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
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

// @MockBean on the repository INTERFACES (not the concrete CompensationPlanService), per
// DashboardControllerTest/AssociateSaleControllerTest's established pattern: this runs a real
// CompensationPlanService inside a real Spring Security filter chain, proving auth actually
// gates this route, while avoiding the JDK25/ByteBuddy concrete-class-mocking issue.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateRankProgressControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean RankTierRepository rankTierRepository;
    @MockBean CompensationPlanVersionRepository versionRepository;
    @MockBean RewardTierRepository rewardTierRepository;

    private String tokenFor(UUID associateId) {
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(AssociateRole.ASSOCIATE);
        return jwtService.generateToken(associate);
    }

    private CompensationPlanVersion version(UUID versionId) {
        return new CompensationPlanVersion(
            versionId, "v1", LocalDate.now().minusDays(1),
            BigDecimal.TEN, BigDecimal.TEN, BigDecimal.TEN, BigDecimal.TEN, BigDecimal.TEN, BigDecimal.TEN,
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.MONTHLY, Instant.now(), null);
    }

    @Test
    void returnsRankProgressJsonForTheAuthenticatedAssociate() throws Exception {
        UUID associateId = UUID.randomUUID();
        UUID currentRankId = UUID.randomUUID();
        UUID versionId = UUID.randomUUID();

        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(currentRankId);
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);

        RankTier currentRank = new RankTier(currentRankId, "Sales Associate", 1, BigDecimal.valueOf(5000));

        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(currentRank));
        when(versionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(version(versionId)));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(versionId)).thenReturn(List.of());

        mockMvc.perform(get("/api/associates/me/rank-progress")
                .header("Authorization", "Bearer " + tokenFor(associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.currentRank").value("Sales Associate"))
            .andExpect(jsonPath("$.currentRankOrder").value(1))
            .andExpect(jsonPath("$.nextRank").doesNotExist())
            .andExpect(jsonPath("$.progressPercent").value(100));
    }

    @Test
    void returns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/rank-progress"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void returns409WhenAssociateHasNoRank() throws Exception {
        UUID associateId = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(associateId);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));

        mockMvc.perform(get("/api/associates/me/rank-progress")
                .header("Authorization", "Bearer " + tokenFor(associateId)))
            .andExpect(status().isConflict());
    }
}
