package com.plotchain.projects;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.company.SettingsAuditLog;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProjectServiceTest {

    @Mock ProjectRepository projectRepository;
    @Mock PlotRepository plotRepository;
    // SettingsAuditService is a concrete class -- a real instance is built over mocked
    // (interface) repositories per the repo's established pattern (see CompanyProfileServiceTest).
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;
    @Mock AssociateRepository associateRepository;

    ProjectService projectService;

    private static final UUID PROJECT_ID = UUID.randomUUID();
    private static final UUID ACTOR_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        projectService = new ProjectService(projectRepository, plotRepository, settingsAuditService);
    }

    private Project seedProject() {
        return new Project(PROJECT_ID, "Green Valley", "Hyderabad", null, null, Instant.now());
    }

    @Test
    void listReturnsAllProjectsWithComputedPlotCounts() {
        when(projectRepository.findAll()).thenReturn(List.of(seedProject()));
        when(plotRepository.countByProjectId(PROJECT_ID)).thenReturn(5L);
        when(plotRepository.countByProjectIdAndStatus(PROJECT_ID, PlotStatus.AVAILABLE)).thenReturn(3L);
        when(plotRepository.countByProjectIdAndStatus(PROJECT_ID, PlotStatus.SOLD)).thenReturn(2L);

        List<ProjectResponse> projects = projectService.list();

        assertThat(projects).hasSize(1);
        ProjectResponse response = projects.get(0);
        assertThat(response.name()).isEqualTo("Green Valley");
        assertThat(response.totalPlots()).isEqualTo(5);
        assertThat(response.availablePlots()).isEqualTo(3);
        assertThat(response.soldPlots()).isEqualTo(2);
        assertThat(response.hasThumbnail()).isFalse();
    }

    @Test
    void getThrowsWhenProjectDoesNotExist() {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> projectService.get(PROJECT_ID))
            .isInstanceOf(ProjectNotFoundException.class);
    }

    @Test
    void createSavesAProjectWithGeneratedIdAndCreatedAt() {
        ProjectResponse response = projectService.create(new ProjectRequest("Green Valley", "Hyderabad"), ACTOR_ID);

        ArgumentCaptor<Project> captor = ArgumentCaptor.forClass(Project.class);
        verify(projectRepository).save(captor.capture());
        Project saved = captor.getValue();
        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getName()).isEqualTo("Green Valley");
        assertThat(saved.getLocation()).isEqualTo("Hyderabad");
        assertThat(saved.getCreatedAt()).isNotNull();
        assertThat(response.name()).isEqualTo("Green Valley");
    }

    @Test
    void createRecordsAnAuditEntry() {
        projectService.create(new ProjectRequest("Green Valley", "Hyderabad"), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("PROJECTS");
        assertThat(saved.getSummary()).isEqualTo("Created project Green Valley");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(saved.getDetail()).contains("\"name\":\"Green Valley\"");
    }

    @Test
    void updateChangesNameAndLocationOfAnExistingProject() {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(seedProject()));

        ProjectResponse response = projectService.update(PROJECT_ID, new ProjectRequest("Blue Ridge", "Pune"), ACTOR_ID);

        ArgumentCaptor<Project> captor = ArgumentCaptor.forClass(Project.class);
        verify(projectRepository).save(captor.capture());
        assertThat(captor.getValue().getName()).isEqualTo("Blue Ridge");
        assertThat(captor.getValue().getLocation()).isEqualTo("Pune");
        assertThat(response.location()).isEqualTo("Pune");
    }

    @Test
    void updateRecordsAnAuditEntry() {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(seedProject()));

        projectService.update(PROJECT_ID, new ProjectRequest("Blue Ridge", "Pune"), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("PROJECTS");
        assertThat(saved.getSummary()).isEqualTo("Updated project Blue Ridge");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(saved.getDetail()).contains("\"before\":{\"id\":")
            .contains("\"name\":\"Green Valley\"")
            .contains("\"after\":{\"id\":")
            .contains("\"name\":\"Blue Ridge\"");
    }

    @Test
    void deleteThrowsWhenProjectHasPlots() {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(seedProject()));
        when(plotRepository.existsByProjectId(PROJECT_ID)).thenReturn(true);

        assertThatThrownBy(() -> projectService.delete(PROJECT_ID, ACTOR_ID))
            .isInstanceOf(ProjectHasPlotsException.class);

        verify(projectRepository, never()).delete(any());
    }

    @Test
    void deleteRemovesTheProjectWhenItHasNoPlots() {
        Project project = seedProject();
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(project));
        when(plotRepository.existsByProjectId(PROJECT_ID)).thenReturn(false);

        projectService.delete(PROJECT_ID, ACTOR_ID);

        verify(projectRepository).delete(project);
    }

    @Test
    void deleteRecordsAnAuditEntryUsingTheSnapshotCapturedBeforeDeletion() {
        Project project = seedProject();
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(project));
        when(plotRepository.existsByProjectId(PROJECT_ID)).thenReturn(false);

        projectService.delete(PROJECT_ID, ACTOR_ID);

        // findById must be called exactly once -- the audit snapshot reuses the entity fetched
        // for the plots-existence check and delete, rather than re-querying the project.
        verify(projectRepository, times(1)).findById(PROJECT_ID);
        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("PROJECTS");
        assertThat(saved.getSummary()).isEqualTo("Deleted project Green Valley");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(saved.getDetail()).contains("\"deleted\":{\"id\":")
            .contains("\"name\":\"Green Valley\"");
    }

    @Test
    void uploadThumbnailStoresBytesAndContentType() {
        Project project = seedProject();
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(project));
        MockMultipartFile file = new MockMultipartFile("file", "thumb.png", "image/png", new byte[]{1, 2, 3});

        projectService.uploadThumbnail(PROJECT_ID, file, ACTOR_ID);

        ArgumentCaptor<Project> captor = ArgumentCaptor.forClass(Project.class);
        verify(projectRepository).save(captor.capture());
        assertThat(captor.getValue().getThumbnail()).containsExactly(1, 2, 3);
        assertThat(captor.getValue().getThumbnailContentType()).isEqualTo("image/png");
    }

    @Test
    void uploadThumbnailRecordsAnAuditEntry() {
        Project project = seedProject();
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(project));
        MockMultipartFile file = new MockMultipartFile("file", "thumb.png", "image/png", new byte[]{1, 2, 3});

        projectService.uploadThumbnail(PROJECT_ID, file, ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("PROJECTS");
        assertThat(saved.getSummary()).isEqualTo("Uploaded thumbnail for project Green Valley");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(saved.getDetail()).contains("\"projectId\":\"" + PROJECT_ID + "\"")
            .contains("\"contentType\":\"image/png\"");
    }

    @Test
    void uploadThumbnailThrowsForUnsupportedContentType() {
        MockMultipartFile svg = new MockMultipartFile("file", "thumb.svg", "image/svg+xml", new byte[]{1});

        assertThatThrownBy(() -> projectService.uploadThumbnail(PROJECT_ID, svg, ACTOR_ID))
            .isInstanceOf(InvalidThumbnailUploadException.class);
    }

    @Test
    void getThumbnailReturnsEmptyWhenNoneStored() {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(seedProject()));

        assertThat(projectService.getThumbnail(PROJECT_ID)).isEmpty();
    }

    @Test
    void isCompleteIsFalseWhenNoProjectsExist() {
        when(projectRepository.findAll()).thenReturn(List.of());

        assertThat(projectService.isComplete()).isFalse();
    }

    @Test
    void isCompleteIsFalseWhenAProjectExistsWithNoPlots() {
        when(projectRepository.findAll()).thenReturn(List.of(seedProject()));
        when(plotRepository.existsByProjectId(PROJECT_ID)).thenReturn(false);

        assertThat(projectService.isComplete()).isFalse();
    }

    @Test
    void isCompleteIsTrueWhenAProjectHasAtLeastOnePlot() {
        when(projectRepository.findAll()).thenReturn(List.of(seedProject()));
        when(plotRepository.existsByProjectId(PROJECT_ID)).thenReturn(true);

        assertThat(projectService.isComplete()).isTrue();
    }
}
