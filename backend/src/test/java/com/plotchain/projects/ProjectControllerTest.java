package com.plotchain.projects;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import com.plotchain.company.SettingsAuditLogRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ProjectControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean ProjectRepository projectRepository;
    @MockBean PlotRepository plotRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;

    private static final UUID PROJECT_ID = UUID.randomUUID();

    private String tokenFor(AssociateRole role) {
        Associate token = new Associate();
        token.setId(UUID.randomUUID());
        token.setRole(role);
        return jwtService.generateToken(token);
    }

    private Project seedProject() {
        return new Project(PROJECT_ID, "Green Valley", "Hyderabad", null, null, Instant.now());
    }

    @Test
    void listReturnsProjectsForAnAdminToken() throws Exception {
        when(projectRepository.findAll()).thenReturn(List.of(seedProject()));

        mockMvc.perform(get("/api/company/projects")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].name").value("Green Valley"));
    }

    @Test
    void listIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/projects")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void createReturns201WithTheSavedProject() throws Exception {
        mockMvc.perform(post("/api/company/projects")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"name\":\"Green Valley\",\"location\":\"Hyderabad\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.name").value("Green Valley"));
    }

    @Test
    void createReturnsFieldErrorWhenNameIsBlank() throws Exception {
        mockMvc.perform(post("/api/company/projects")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"name\":\"\",\"location\":\"Hyderabad\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fields.name").isNotEmpty());
    }

    @Test
    void getReturns404WhenProjectDoesNotExist() throws Exception {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/company/projects/" + PROJECT_ID)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isNotFound());
    }

    @Test
    void deleteReturns409WhenProjectHasPlots() throws Exception {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(seedProject()));
        when(plotRepository.existsByProjectId(PROJECT_ID)).thenReturn(true);

        mockMvc.perform(delete("/api/company/projects/" + PROJECT_ID)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    void deleteReturns204WhenProjectHasNoPlots() throws Exception {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(seedProject()));
        when(plotRepository.existsByProjectId(PROJECT_ID)).thenReturn(false);

        mockMvc.perform(delete("/api/company/projects/" + PROJECT_ID)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isNoContent());
    }

    @Test
    void updateReturns200WithChangedFields() throws Exception {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(seedProject()));

        mockMvc.perform(put("/api/company/projects/" + PROJECT_ID)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"name\":\"Blue Ridge\",\"location\":\"Pune\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.location").value("Pune"));
    }

    @Test
    void uploadThumbnailReturns204() throws Exception {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(seedProject()));
        MockMultipartFile file = new MockMultipartFile("file", "thumb.png", "image/png", new byte[]{1, 2, 3});

        mockMvc.perform(multipart("/api/company/projects/" + PROJECT_ID + "/thumbnail")
                .file(file)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isNoContent());
    }

    @Test
    void getThumbnailReturns404WhenNoneStored() throws Exception {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(seedProject()));

        mockMvc.perform(get("/api/company/projects/" + PROJECT_ID + "/thumbnail")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isNotFound());
    }
}
