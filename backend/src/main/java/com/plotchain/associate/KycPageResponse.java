package com.plotchain.associate;

import java.util.List;

public record KycPageResponse(List<KycQueueEntryResponse> entries, int page, int size, long totalElements) {}
