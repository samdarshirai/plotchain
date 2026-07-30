package com.plotchain.projects;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PlotCsvControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean PlotRepository plotRepository;

    private static final UUID PROJECT_ID = UUID.randomUUID();
    private static final String HEADER = "plot_no,plot_type,area_sqft,rate,price,status\n";

    private String tokenFor(AssociateRole role) {
        Associate token = new Associate();
        token.setId(UUID.randomUUID());
        token.setRole(role);
        return jwtService.generateToken(token);
    }

    @Test
    void csvTemplateReturnsTheHeaderRowForAnAdminToken() throws Exception {
        mockMvc.perform(get("/api/company/projects/plots/csv-template")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(content().string(HEADER));
    }

    @Test
    void validateReturnsErrorsWithoutPersisting() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "plots.csv", "text/csv",
            (HEADER + "A-101,DIAMOND,1200,500,600000,AVAILABLE\n").getBytes(StandardCharsets.UTF_8));

        mockMvc.perform(multipart("/api/company/projects/" + PROJECT_ID + "/plots/csv/validate")
                .file(file)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalRows").value(1))
            .andExpect(jsonPath("$.validRows").value(0))
            .andExpect(jsonPath("$.errors[0].field").value("plot_type"));
    }

    @Test
    void commitReturns409AndPersistsNothingWhenFileHasErrors() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "plots.csv", "text/csv",
            (HEADER + "A-101,DIAMOND,1200,500,600000,AVAILABLE\n").getBytes(StandardCharsets.UTF_8));

        mockMvc.perform(multipart("/api/company/projects/" + PROJECT_ID + "/plots/csv/commit")
                .file(file)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.errors").isNotEmpty());
    }

    @Test
    void commitReturns201WhenFileIsClean() throws Exception {
        when(plotRepository.findAllByProjectIdAndPlotNoIn(PROJECT_ID, List.of("A-101"))).thenReturn(List.of());
        MockMultipartFile file = new MockMultipartFile("file", "plots.csv", "text/csv",
            (HEADER + "A-101,NORMAL,1200,500,600000,AVAILABLE\n").getBytes(StandardCharsets.UTF_8));

        mockMvc.perform(multipart("/api/company/projects/" + PROJECT_ID + "/plots/csv/commit")
                .file(file)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isCreated());
    }

    @Test
    void validateIsForbiddenForAnAssociateToken() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "plots.csv", "text/csv", HEADER.getBytes(StandardCharsets.UTF_8));

        mockMvc.perform(multipart("/api/company/projects/" + PROJECT_ID + "/plots/csv/validate")
                .file(file)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }
}
