package com.plotchain.projects;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Service
public class ProjectService {

    private static final Set<String> ALLOWED_THUMBNAIL_CONTENT_TYPES =
        Set.of("image/png", "image/jpeg", "image/webp");

    private final ProjectRepository projectRepository;
    private final PlotRepository plotRepository;

    public ProjectService(ProjectRepository projectRepository, PlotRepository plotRepository) {
        this.projectRepository = projectRepository;
        this.plotRepository = plotRepository;
    }

    public List<ProjectResponse> list() {
        return projectRepository.findAll().stream().map(this::toResponse).toList();
    }

    public ProjectResponse get(UUID id) {
        return toResponse(findOrThrow(id));
    }

    public ProjectResponse create(ProjectRequest request) {
        Project project = new Project(UUID.randomUUID(), request.name(), request.location(), null, null, Instant.now());
        projectRepository.save(project);
        return toResponse(project);
    }

    public ProjectResponse update(UUID id, ProjectRequest request) {
        Project project = findOrThrow(id);
        project.setName(request.name());
        project.setLocation(request.location());
        projectRepository.save(project);
        return toResponse(project);
    }

    public void delete(UUID id) {
        Project project = findOrThrow(id);
        if (plotRepository.existsByProjectId(id)) {
            throw new ProjectHasPlotsException("Cannot delete project " + id + " while it still has plots");
        }
        projectRepository.delete(project);
    }

    public void uploadThumbnail(UUID id, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new InvalidThumbnailUploadException("thumbnail file is empty");
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_THUMBNAIL_CONTENT_TYPES.contains(contentType)) {
            throw new InvalidThumbnailUploadException("unsupported thumbnail content type: " + contentType);
        }
        Project project = findOrThrow(id);
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        project.setThumbnail(bytes);
        project.setThumbnailContentType(contentType);
        projectRepository.save(project);
    }

    public Optional<ThumbnailBytes> getThumbnail(UUID id) {
        Project project = findOrThrow(id);
        if (project.getThumbnail() == null) {
            return Optional.empty();
        }
        return Optional.of(new ThumbnailBytes(project.getThumbnail(), project.getThumbnailContentType()));
    }

    // Non-required step (StepDefinition(4, "projects", false)): purely a progress-rail
    // checkmark, not part of canGoLive. Defined as "at least one project with at least one
    // plot" rather than "at least one project" -- a project with zero plots isn't a usable
    // catalog entry yet.
    public boolean isComplete() {
        return projectRepository.findAll().stream()
            .anyMatch(project -> plotRepository.existsByProjectId(project.getId()));
    }

    private Project findOrThrow(UUID id) {
        return projectRepository.findById(id).orElseThrow(() -> new ProjectNotFoundException(id));
    }

    private ProjectResponse toResponse(Project project) {
        UUID id = project.getId();
        return new ProjectResponse(
            id,
            project.getName(),
            project.getLocation(),
            project.getThumbnail() != null,
            plotRepository.countByProjectId(id),
            plotRepository.countByProjectIdAndStatus(id, PlotStatus.AVAILABLE),
            plotRepository.countByProjectIdAndStatus(id, PlotStatus.SOLD),
            project.getCreatedAt()
        );
    }
}
