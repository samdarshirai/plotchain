package com.plotchain.company;

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
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockBean on the repository INTERFACES so this runs a real RootAssociateProvisioningService
// inside a real Spring Security filter chain, per AdminControllerTest's pattern. RankTierRepository
// is mocked too since RootAssociateProvisioningService.create() requires a rank tier (root
// associates are role = ASSOCIATE, and no rank tiers are seeded in the test schema).
// RootAssociateProvisioningService now depends on the real SettingsAuditService bean, so its own
// repository dependency (SettingsAuditLogRepository) needs mocking too -- per
// CompanyProfileControllerTest's pattern -- otherwise the real H2 DB rejects the audit insert
// since the JWT actor id was never persisted as a real associate row.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RootAssociateControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean RankTierRepository rankTierRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;

    private final RankTier lowestRank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(5000));

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        // Configure the mock to return this ACTIVE associate when queried during filter authentication
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    private void stubNoExistingRoots() {
        when(associateRepository.findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc(AssociateRole.ASSOCIATE))
            .thenReturn(List.of());
    }

    @Test
    void createReturnsCreatedWithAOneTimePasswordForALeftRootOnly() throws Exception {
        stubNoExistingRoots();
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(lowestRank));
        when(associateRepository.findTopByUserIdStartingWithOrderByUserIdDesc("VP")).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/company/root-associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"name\":\"Root One\",\"phone\":\"9990001111\",\"seedRightRoot\":false}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.left.name").value("Root One"))
            .andExpect(jsonPath("$.left.slotLabel").value("LEFT"))
            .andExpect(jsonPath("$.left.temporaryPassword").isNotEmpty())
            .andExpect(jsonPath("$.right").doesNotExist());
    }

    @Test
    void createReturnsBothSlotsWhenSeedingARightRoot() throws Exception {
        stubNoExistingRoots();
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(lowestRank));
        when(associateRepository.findTopByUserIdStartingWithOrderByUserIdDesc("VP")).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/company/root-associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"name\":\"Root Left\",\"phone\":\"9990001111\",\"seedRightRoot\":true,"
                    + "\"rightName\":\"Root Right\",\"rightPhone\":\"9990002222\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.left.slotLabel").value("LEFT"))
            .andExpect(jsonPath("$.right.slotLabel").value("RIGHT"))
            .andExpect(jsonPath("$.right.name").value("Root Right"));
    }

    @Test
    void createReturnsBadRequestForBlankRequiredFields() throws Exception {
        mockMvc.perform(post("/api/company/root-associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"name\":\"\",\"phone\":\"\",\"seedRightRoot\":false}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void createReturnsBadRequestWhenSeedingARightRootWithoutItsFields() throws Exception {
        stubNoExistingRoots();
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(lowestRank));
        when(associateRepository.findTopByUserIdStartingWithOrderByUserIdDesc("VP")).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/company/root-associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"name\":\"Root Left\",\"phone\":\"9990001111\",\"seedRightRoot\":true}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void createReturnsConflictWhenARootAlreadyExists() throws Exception {
        Associate existingRoot = new Associate();
        existingRoot.setRole(AssociateRole.ASSOCIATE);
        when(associateRepository.findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc(AssociateRole.ASSOCIATE))
            .thenReturn(List.of(existingRoot));

        mockMvc.perform(post("/api/company/root-associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"name\":\"Root Two\",\"phone\":\"9990001111\",\"seedRightRoot\":false}"))
            .andExpect(status().isConflict());
    }

    @Test
    void listReturnsEmptySlotsWhenNoRootsExist() throws Exception {
        stubNoExistingRoots();

        mockMvc.perform(get("/api/company/root-associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.leftOccupied").value(false))
            .andExpect(jsonPath("$.rightOccupied").value(false))
            .andExpect(jsonPath("$.roots").isEmpty());
    }

    @Test
    void listReturnsOccupiedSlotsWhenRootsExist() throws Exception {
        Associate left = new Associate();
        left.setId(UUID.randomUUID());
        left.setUserId("VP00001");
        left.setName("Root Left");
        when(associateRepository.findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc(AssociateRole.ASSOCIATE))
            .thenReturn(List.of(left));

        mockMvc.perform(get("/api/company/root-associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.leftOccupied").value(true))
            .andExpect(jsonPath("$.rightOccupied").value(false))
            .andExpect(jsonPath("$.roots[0].userId").value("VP00001"))
            .andExpect(jsonPath("$.roots[0].slotLabel").value("LEFT"));
    }

    @Test
    void listIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/root-associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }
}
