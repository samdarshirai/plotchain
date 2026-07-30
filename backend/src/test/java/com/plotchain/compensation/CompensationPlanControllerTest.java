package com.plotchain.compensation;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import com.plotchain.company.SettingsAuditLogRepository;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockBean on the 4 repository INTERFACES CompensationPlanService depends on, so this runs a
// real CompensationPlanService inside a real Spring Security filter chain, per
// DashboardControllerTest's pattern.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CompensationPlanControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean CompensationPlanVersionRepository versionRepository;
    @MockBean RoyaltyBonusRateRepository royaltyBonusRateRepository;
    @MockBean RewardTierRepository rewardTierRepository;
    @MockBean RankTierRepository rankTierRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;
    @MockBean AssociateRepository associateRepository;

    private static final UUID SEED_VERSION_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    private String tokenFor(AssociateRole role) {
        Associate token = new Associate();
        token.setId(UUID.randomUUID());
        token.setRole(role);
        return jwtService.generateToken(token);
    }

    // Mirrors the V8 migration's genesis row exactly.
    private CompensationPlanVersion seedVersion() {
        return new CompensationPlanVersion(
            SEED_VERSION_ID,
            "v1",
            LocalDate.of(2000, 1, 1),
            new BigDecimal("10.00"),
            new BigDecimal("7.00"),
            new BigDecimal("5.00"),
            new BigDecimal("2.00"),
            new BigDecimal("5.00"),
            new BigDecimal("15.00"),
            new BigDecimal("1100.00"),
            new BigDecimal("500.00"),
            SettlementCycle.SEMI_MONTHLY,
            Instant.parse("2020-01-01T00:00:00Z"),
            null
        );
    }

    private static final String VALID_PUT_JSON = """
        {
          "directIncomePct": 10.00,
          "matchingIncomePct": 8.00,
          "sponsorMatchingPct": 5.00,
          "tdsPct": 2.00,
          "adminChargeWithPanPct": 5.00,
          "adminChargeWithoutPanPct": 15.00,
          "activationFee": 1100.00,
          "minWithdrawal": 500.00,
          "settlementCycle": "SEMI_MONTHLY",
          "royaltyBonusRates": [],
          "rewardTiers": [
            {"tierLevel": 1, "volumeThreshold": 1000.00, "cashReward": 100.00, "perkDescription": "Tier 1"},
            {"tierLevel": 2, "volumeThreshold": 2000.00, "cashReward": 200.00, "perkDescription": "Tier 2"}
          ]
        }
        """;

    private static final String GAPPED_TIERS_PUT_JSON = """
        {
          "directIncomePct": 10.00,
          "matchingIncomePct": 8.00,
          "sponsorMatchingPct": 5.00,
          "tdsPct": 2.00,
          "adminChargeWithPanPct": 5.00,
          "adminChargeWithoutPanPct": 15.00,
          "activationFee": 1100.00,
          "minWithdrawal": 500.00,
          "settlementCycle": "SEMI_MONTHLY",
          "royaltyBonusRates": [],
          "rewardTiers": [
            {"tierLevel": 1, "volumeThreshold": 1000.00, "cashReward": 100.00, "perkDescription": "Tier 1"},
            {"tierLevel": 3, "volumeThreshold": 2000.00, "cashReward": 200.00, "perkDescription": "Tier 3"}
          ]
        }
        """;

    private static final String BLANK_SETTLEMENT_CYCLE_PUT_JSON = """
        {
          "directIncomePct": 10.00,
          "matchingIncomePct": 8.00,
          "sponsorMatchingPct": 5.00,
          "tdsPct": 2.00,
          "adminChargeWithPanPct": 5.00,
          "adminChargeWithoutPanPct": 15.00,
          "activationFee": 1100.00,
          "minWithdrawal": 500.00,
          "settlementCycle": "",
          "royaltyBonusRates": [],
          "rewardTiers": []
        }
        """;

    @Test
    void getCurrentReturnsTheSeededGenesisValuesForAnAdminToken() throws Exception {
        CompensationPlanVersion seed = seedVersion();
        when(versionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(seed));
        when(royaltyBonusRateRepository.findAllByPlanVersionId(SEED_VERSION_ID)).thenReturn(List.of());
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(SEED_VERSION_ID)).thenReturn(List.of());
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());

        mockMvc.perform(get("/api/company/compensation")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.versionLabel").value("v1"))
            .andExpect(jsonPath("$.matchingIncomePct").value(7.00))
            .andExpect(jsonPath("$.directIncomePct").value(10.00))
            .andExpect(jsonPath("$.settlementCycle").value("SEMI_MONTHLY"));
    }

    // Test case 2 from the task brief. Deliberately deferred out of this file in Task 6 because
    // it depends on Task 7's SecurityConfig matcher for GET /api/company/compensation -- without
    // it, GET falls through to anyRequest().authenticated() and an associate token would get
    // 200, not 403. That matcher now exists (SecurityConfig.java), so this passes for real: no
    // repository stubbing needed, since the request is rejected at the security layer before it
    // ever reaches CompensationPlanService.
    @Test
    void getCurrentIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/compensation")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void putCompensationSavesAndReturnsAnIncrementedVersionLabel() throws Exception {
        when(versionRepository.findFirstByOrderByCreatedAtDesc()).thenReturn(Optional.of(seedVersion()));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());

        mockMvc.perform(put("/api/company/compensation")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(VALID_PUT_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.versionLabel").value("v2"))
            .andExpect(jsonPath("$.matchingIncomePct").value(8.00));
    }

    @Test
    void putCompensationWithGappedRewardTiersReturnsConflict() throws Exception {
        mockMvc.perform(put("/api/company/compensation")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(GAPPED_TIERS_PUT_JSON))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    void putCompensationWithBlankSettlementCycleReturnsFieldError() throws Exception {
        mockMvc.perform(put("/api/company/compensation")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(BLANK_SETTLEMENT_CYCLE_PUT_JSON))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fields.settlementCycle").isNotEmpty());
    }
}
