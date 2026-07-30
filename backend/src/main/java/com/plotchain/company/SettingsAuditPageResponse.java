package com.plotchain.company;

import java.util.List;

public record SettingsAuditPageResponse(List<SettingsAuditEntryResponse> entries, int page, int size, long totalElements) {}
