package com.plotchain.masterproject;

import java.time.Instant;
import org.mockito.ArgumentCaptor;
import com.plotchain.projects.Project;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;

@ExtendWith(MockitoExtension.class)
class MasterProjectServiceTest {

    @Mock MasterProjectRepository repository;
    @Mock SettingsAuditLogRepository auditLogRepository;
    @Mock AssociateRepository associateRepository;
    @Mock com.plotchain.projects.ProjectRepository projectRepository;

    MasterProjectService service;
    static final UUID ACTOR = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService audit = new SettingsAuditService(auditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        service = new MasterProjectService(repository, audit, projectRepository);
    }

    private static MasterProjectRequest request(String name, MasterProject.Status status) {
        return new MasterProjectRequest(name, MasterProject.Type.APARTMENT, "Pune", "MH",
            new BigDecimal("25.5"), new BigDecimal("1500"), status);
    }

    @Test
    void createDefaultsToActiveAndStoresFields() {
        MasterProjectResponse r = service.create(request(" Green Valley ", null), ACTOR);
        assertThat(r.name()).isEqualTo("Green Valley");
        assertThat(r.status()).isEqualTo(MasterProject.Status.ACTIVE);
        assertThat(r.type()).isEqualTo(MasterProject.Type.APARTMENT);
        verify(projectRepository).save(any());
    }

    @Test
    void createRejectsDuplicateName() {
        when(repository.existsByNameIgnoreCase("Dup")).thenReturn(true);
        assertThatThrownBy(() -> service.create(request("Dup", null), ACTOR)).isInstanceOf(MasterProjectException.class);
        verify(repository, never()).save(any());
    }

    @Test
    void updateCanSuspend() {
        UUID id = UUID.randomUUID();
        when(repository.findById(id)).thenReturn(Optional.of(new MasterProject(id)));
        assertThat(service.update(id, request("P", MasterProject.Status.SUSPENDED), ACTOR).status())
            .isEqualTo(MasterProject.Status.SUSPENDED);
    }

    @Test
    void uploadMapRejectsNonImage() {
        UUID id = UUID.randomUUID();
        var pdf = new MockMultipartFile("file", "m.pdf", "application/pdf", new byte[]{1});
        assertThatThrownBy(() -> service.uploadMap(id, MasterProjectService.MapKind.PROJECT, pdf, ACTOR))
            .isInstanceOf(MasterProjectException.class);
    }

    @Test
    void uploadMapStoresPerKind() {
        UUID id = UUID.randomUUID();
        MasterProject p = new MasterProject(id);
        when(repository.findById(id)).thenReturn(Optional.of(p));
        service.uploadMap(id, MasterProjectService.MapKind.LOCATION,
            new MockMultipartFile("file", "m.png", "image/png", new byte[]{1, 2}), ACTOR);
        assertThat(p.getLocationMap()).hasSize(2);
        assertThat(p.getProjectMap()).isNull();
    }

    @Test
    void createCarriesParkAndRoadDefaultsToPlotSide() {
        MasterProjectRequest req = new MasterProjectRequest("Green Valley", MasterProject.Type.APARTMENT, "Pune", "MH",
            new BigDecimal("25.5"), new BigDecimal("1500"), null, new BigDecimal("10"), new BigDecimal("7"), new BigDecimal("6"));

        MasterProjectResponse r = service.create(req, ACTOR);

        ArgumentCaptor<Project> captor = ArgumentCaptor.forClass(Project.class);
        verify(projectRepository).save(captor.capture());
        assertThat(captor.getValue().getParkFacingExtraPercent()).isEqualByComparingTo("7");
        assertThat(captor.getValue().getRoadSideExtraPercent()).isEqualByComparingTo("6");
        assertThat(r.parkFacingExtraPercent()).isEqualByComparingTo("7");
        assertThat(r.roadSideExtraPercent()).isEqualByComparingTo("6");
    }

    @Test
    void updateWithoutParkAndRoadKeepsCurrentValues() {
        UUID id = UUID.randomUUID();
        when(repository.findById(id)).thenReturn(Optional.of(new MasterProject(id)));
        Project plotSide = new Project(id, "P", "Pune", null, null, Instant.now());
        plotSide.setParkFacingExtraPercent(new BigDecimal("7"));
        plotSide.setRoadSideExtraPercent(new BigDecimal("6"));
        when(projectRepository.findById(id)).thenReturn(Optional.of(plotSide));

        MasterProjectResponse r = service.update(id, request("P", null), ACTOR);

        assertThat(plotSide.getParkFacingExtraPercent()).isEqualByComparingTo("7");
        assertThat(plotSide.getRoadSideExtraPercent()).isEqualByComparingTo("6");
        assertThat(r.parkFacingExtraPercent()).isEqualByComparingTo("7");
    }
}
