package com.plotchain.supportticket;

import java.util.List;

// Same shape as KycPageResponse / AdminAssociatePageResponse. Reused by the associate's own
// history endpoint (unit 4).
public record SupportTicketPageResponse(List<SupportTicketResponse> entries, int page, int size, long totalElements) {}
