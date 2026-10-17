package com.plotchain.news;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public record NewsRequest(
    @NotNull LocalDate newsDate,
    @NotBlank @Size(max = 200) String title,
    @NotBlank @Size(max = 5000) String body
) {}
