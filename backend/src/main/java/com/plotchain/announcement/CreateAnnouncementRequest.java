package com.plotchain.announcement;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// 300 matches announcement.title VARCHAR(300); body is TEXT, unbounded. audience/publishedAt are
// deliberately not request fields (spec Decision 2).
public record CreateAnnouncementRequest(
    @NotBlank @Size(max = 300) String title,
    @NotBlank String body
) {}
