package com.plotchain.projects;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
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
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PlotControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean PlotRepository plotRepository;

    private static final UUID PROJECT_ID = UUID.randomUUID();
    private static final UUID PLOT_ID = UUID.randomUUID();

    private String tokenFor(AssociateRole role) {
        Associate token = new Associate();
        token.setId(UUID.randomUUID());
        token.setRole(role);
        return jwtService.generateToken(token);
    }

    private Plot seedPlot() {
        return new Plot(PLOT_ID, PROJECT_ID, "A-101", PlotType.NORMAL,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), PlotStatus.AVAILABLE);
    }

    @Test
    void listReturnsAPageForAnAdminToken() throws Exception {
        Page<Plot> page = new PageImpl<>(List.of(seedPlot()), PageRequest.of(0, 20), 1);
        when(plotRepository.findAllByProjectId(eq(PROJECT_ID), any())).thenReturn(page);

        mockMvc.perform(get("/api/company/projects/" + PROJECT_ID + "/plots")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plots[0].plotNo").value("A-101"))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void listIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/projects/" + PROJECT_ID + "/plots")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void createReturns201() throws Exception {
        when(plotRepository.findAllByProjectIdAndPlotNoIn(PROJECT_ID, List.of("A-101"))).thenReturn(List.of());

        mockMvc.perform(post("/api/company/projects/" + PROJECT_ID + "/plots")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"plotNo\":\"A-101\",\"plotType\":\"NORMAL\",\"areaSqft\":1200,\"rate\":500,\"price\":600000,\"status\":\"AVAILABLE\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.plotNo").value("A-101"));
    }

    @Test
    void createReturns409ForADuplicatePlotNo() throws Exception {
        when(plotRepository.findAllByProjectIdAndPlotNoIn(PROJECT_ID, List.of("A-101"))).thenReturn(List.of(seedPlot()));

        mockMvc.perform(post("/api/company/projects/" + PROJECT_ID + "/plots")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"plotNo\":\"A-101\",\"plotType\":\"NORMAL\",\"areaSqft\":1200,\"rate\":500,\"price\":600000,\"status\":\"AVAILABLE\"}"))
            .andExpect(status().isConflict());
    }

    @Test
    void getReturns404WhenPlotDoesNotExistUnderThatProject() throws Exception {
        when(plotRepository.findByIdAndProjectId(PLOT_ID, PROJECT_ID)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/company/projects/" + PROJECT_ID + "/plots/" + PLOT_ID)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isNotFound());
    }

    @Test
    void updateReturns200() throws Exception {
        when(plotRepository.findByIdAndProjectId(PLOT_ID, PROJECT_ID)).thenReturn(Optional.of(seedPlot()));
        when(plotRepository.findAllByProjectIdAndPlotNoIn(PROJECT_ID, List.of("A-102"))).thenReturn(List.of());

        mockMvc.perform(put("/api/company/projects/" + PROJECT_ID + "/plots/" + PLOT_ID)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"plotNo\":\"A-102\",\"plotType\":\"CORNER\",\"areaSqft\":1300,\"rate\":550,\"price\":715000,\"status\":\"BOOKED\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plotNo").value("A-102"));
    }

    @Test
    void deleteReturns204() throws Exception {
        when(plotRepository.findByIdAndProjectId(PLOT_ID, PROJECT_ID)).thenReturn(Optional.of(seedPlot()));

        mockMvc.perform(delete("/api/company/projects/" + PROJECT_ID + "/plots/" + PLOT_ID)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isNoContent());
    }
}
