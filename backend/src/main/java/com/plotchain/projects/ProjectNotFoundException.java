package com.plotchain.projects;

import java.util.UUID;

public class ProjectNotFoundException extends RuntimeException {
    public ProjectNotFoundException(UUID projectId) {
        super("Project not found: " + projectId);
    }
}
