package com.plotchain.projects;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import com.plotchain.company.SettingsAuditLogRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PlotGridControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @Autowired ObjectMapper objectMapper;

    @MockBean AssociateRepository associateRepository;
    @MockBean PlotRepository plotRepository;
    @MockBean ProjectRepository projectRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;

    private static final UUID PROJECT_ID = UUID.randomUUID();

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    private Plot plot(String plotNo, PlotStatus status) {
        return new Plot(UUID.randomUUID(), PROJECT_ID, plotNo, PlotType.CORNER,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), status);
    }

    private void stubProject(List<Plot> plots) {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(true);
        when(plotRepository.findByProjectId(PROJECT_ID)).thenReturn(plots);
    }

    @Test
    void anAssociateTokenGetsTheGridAsABareNaturallyOrderedArray() throws Exception {
        stubProject(List.of(plot("10", PlotStatus.SOLD), plot("2", PlotStatus.AVAILABLE)));

        mockMvc.perform(get("/api/projects/" + PROJECT_ID + "/plots/grid")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[0].plotNo").value("2"))
            .andExpect(jsonPath("$[0].type").value("CORNER"))
            .andExpect(jsonPath("$[0].area").value(1200.00))
            .andExpect(jsonPath("$[0].price").value(600000.00))
            .andExpect(jsonPath("$[0].status").value("AVAILABLE"))
            .andExpect(jsonPath("$[1].plotNo").value("10"))
            .andExpect(jsonPath("$[1].status").value("SOLD"));
    }

    @Test
    void anAdminTokenGetsTheGridToo() throws Exception {
        stubProject(List.of(plot("A-1", PlotStatus.BOOKED)));

        mockMvc.perform(get("/api/projects/" + PROJECT_ID + "/plots/grid")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].status").value("BOOKED"));
    }

    @Test
    void aProjectWithNoPlotsReturnsAnEmptyArrayNot404() throws Exception {
        stubProject(List.of());

        mockMvc.perform(get("/api/projects/" + PROJECT_ID + "/plots/grid")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void anUnknownProjectIs404() throws Exception {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(false);

        mockMvc.perform(get("/api/projects/" + PROJECT_ID + "/plots/grid")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isNotFound());
    }

    @Test
    void noTokenIs401() throws Exception {
        mockMvc.perform(get("/api/projects/" + PROJECT_ID + "/plots/grid"))
            .andExpect(status().isUnauthorized());
    }

    // Data-leak guard (Decision 10: "and nothing else"). Exact key set: a field added to the DTO later
    // (rate, thumbnail, buyerName, bookingId, associateId, ...) fails this test.
    @Test
    void eachRowHasExactlyTheSixAllowedKeysAndNothingElse() throws Exception {
        stubProject(List.of(plot("A-1", PlotStatus.BOOKED)));

        String body = mockMvc.perform(get("/api/projects/" + PROJECT_ID + "/plots/grid")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andReturn().getResponse().getContentAsString();

        JsonNode row = objectMapper.readTree(body).get(0);
        Set<String> keys = new HashSet<>();
        row.fieldNames().forEachRemaining(keys::add);
        assertThat(keys).containsExactlyInAnyOrder("plotId", "plotNo", "type", "area", "price", "status");
        assertThat(body).doesNotContain("rate").doesNotContain("buyer").doesNotContain("booking")
            .doesNotContain("associate").doesNotContain("thumbnail");
    }
}
