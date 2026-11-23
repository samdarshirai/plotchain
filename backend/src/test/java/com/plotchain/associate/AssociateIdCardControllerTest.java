package com.plotchain.associate;

import com.plotchain.income.DesignationService;
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
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockBean on the repository INTERFACES (not the concrete AssociateIdCardService), per
// AssociateRankProgressControllerTest/KycSubmissionControllerTest's established pattern: this
// runs a real AssociateIdCardService inside a real Spring Security filter chain, proving auth
// actually gates this route, while avoiding the JDK25/ByteBuddy concrete-class-mocking issue.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateIdCardControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean RankTierRepository rankTierRepository;
    @MockBean DesignationService designationService;

    private String tokenFor(UUID associateId) {
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(AssociateRole.ASSOCIATE);
        return jwtService.generateToken(associate);
    }

    @Test
    void returnsIdCardJsonForTheAuthenticatedAssociate() throws Exception {
        UUID associateId = UUID.randomUUID();
        UUID rankId = UUID.randomUUID();
        String token = tokenFor(associateId);

        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setUserId("VP00042");
        associate.setName("Priya Nair");
        associate.setRankId(rankId);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(designationService.designationOf(associateId)).thenReturn("Sales Manager");

        mockMvc.perform(get("/api/associates/me/id-card")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.idNumber").value("VP00042"))
            .andExpect(jsonPath("$.name").value("Priya Nair"))
            .andExpect(jsonPath("$.designation").value("Sales Manager"))
            .andExpect(jsonPath("$.photoUrl").doesNotExist())
            .andExpect(jsonPath("$.qrPayload").value("VP00042"));
    }

    @Test
    void returns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/id-card"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void returns409WhenAssociateHasNoRank() throws Exception {
        UUID associateId = UUID.randomUUID();
        String token = tokenFor(associateId);
        Associate associate = new Associate();
        associate.setId(associateId);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));

        mockMvc.perform(get("/api/associates/me/id-card")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").isNotEmpty());
    }
}
