package com.plotchain.masterproject;

import com.plotchain.company.SettingsAuditService;
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Service
public class MasterProjectService {

    private static final String AUDIT_SECTION = "MASTER_PROJECTS";
    private static final Set<String> MAP_CONTENT_TYPES = Set.of("image/png", "image/jpeg", "image/webp");

    public enum MapKind { LOCATION, PROJECT }

    public record MapBytes(byte[] data, String contentType) {}

    private final MasterProjectRepository repository;
    private final SettingsAuditService auditService;
    private final ProjectRepository projectRepository;

    public MasterProjectService(MasterProjectRepository repository, SettingsAuditService auditService,
                                ProjectRepository projectRepository) {
        this.projectRepository = projectRepository;
        this.repository = repository;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public List<MasterProjectResponse> list() {
        return repository.findAllByOrderByNameAsc().stream().map(MasterProjectResponse::of).toList();
    }

    @Transactional
    public MasterProjectResponse create(MasterProjectRequest request, UUID actorId) {
        String name = request.name().trim();
        if (repository.existsByNameIgnoreCase(name)) {
            throw new MasterProjectException(HttpStatus.CONFLICT, "Project name already in use: " + name);
        }
        MasterProject project = new MasterProject(UUID.randomUUID());
        apply(project, request);
        if (request.status() != null) project.setStatus(request.status());
        repository.save(project);
        // The plot-side project is created with the master (same id) -- the Plots screen no longer adds projects.
        Project plotSide = new Project(project.getId(), project.getName(), project.getLocation(), null, null, Instant.now());
        plotSide.setMasterProjectId(project.getId());
        projectRepository.save(plotSide);
        auditService.record(AUDIT_SECTION, "Created master project " + name, Map.of("id", project.getId().toString()), actorId);
        return MasterProjectResponse.of(project);
    }

    @Transactional
    public MasterProjectResponse update(UUID id, MasterProjectRequest request, UUID actorId) {
        MasterProject project = findOrThrow(id);
        String name = request.name().trim();
        if (repository.existsByNameIgnoreCaseAndIdNot(name, id)) {
            throw new MasterProjectException(HttpStatus.CONFLICT, "Project name already in use: " + name);
        }
        apply(project, request);
        if (request.status() != null) project.setStatus(request.status());
        project.touch();
        repository.save(project);
        projectRepository.findById(id).ifPresent(plotSide -> {
            plotSide.setName(project.getName());
            plotSide.setLocation(project.getLocation());
            projectRepository.save(plotSide);
        });
        auditService.record(AUDIT_SECTION, "Updated master project " + name,
            Map.of("id", id.toString(), "status", project.getStatus().name()), actorId);
        return MasterProjectResponse.of(project);
    }

    @Transactional
    public void uploadMap(UUID id, MapKind kind, MultipartFile file, UUID actorId) {
        if (file == null || file.isEmpty()) {
            throw new MasterProjectException(HttpStatus.BAD_REQUEST, "map file is empty");
        }
        String contentType = file.getContentType();
        if (contentType == null || !MAP_CONTENT_TYPES.contains(contentType)) {
            throw new MasterProjectException(HttpStatus.BAD_REQUEST, "unsupported map content type: " + contentType);
        }
        MasterProject project = findOrThrow(id);
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        if (kind == MapKind.LOCATION) project.setLocationMap(bytes, contentType);
        else project.setProjectMap(bytes, contentType);
        project.touch();
        repository.save(project);
        auditService.record(AUDIT_SECTION, "Uploaded " + kind.name().toLowerCase() + " map for " + project.getName(),
            Map.of("id", id.toString(), "contentType", contentType), actorId);
    }

    @Transactional(readOnly = true)
    public Optional<MapBytes> getMap(UUID id, MapKind kind) {
        MasterProject project = findOrThrow(id);
        byte[] data = kind == MapKind.LOCATION ? project.getLocationMap() : project.getProjectMap();
        if (data == null) return Optional.empty();
        return Optional.of(new MapBytes(data,
            kind == MapKind.LOCATION ? project.getLocationMapContentType() : project.getProjectMapContentType()));
    }

    private void apply(MasterProject p, MasterProjectRequest r) {
        p.setName(r.name().trim());
        p.setType(r.type());
        p.setCity(r.city().trim());
        p.setState(r.state().trim());
        // project.location (plot side) is NOT NULL; derive it since the screen has no Location field.
        p.setLocation(p.getCity() + ", " + p.getState());
        p.setBusinessPercentage(r.businessPercentage());
        p.setRatePerSqft(r.ratePerSqft());
    }

    private MasterProject findOrThrow(UUID id) {
        return repository.findById(id)
            .orElseThrow(() -> new MasterProjectException(HttpStatus.NOT_FOUND, "Master project not found: " + id));
    }
}
