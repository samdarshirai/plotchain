package com.plotchain.projects;

import jakarta.validation.constraints.NotBlank;

public record ProjectRequest(@NotBlank String name, @NotBlank String location) {}
