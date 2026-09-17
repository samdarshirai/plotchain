package com.plotchain.epin;

import java.util.List;

// epin-domain unit 2 (Flows "Admin register"): field shape matches AdminAssociatePageResponse
// exactly (list, page, size, totalElements).
public record EPinPageResponse(List<EPinResponse> epins, int page, int size, long totalElements) {}
