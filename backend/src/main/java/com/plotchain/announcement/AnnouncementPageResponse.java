package com.plotchain.announcement;

import java.util.List;

// Same shape as SupportTicketPageResponse / KycPageResponse (list field named "entries").
public record AnnouncementPageResponse(List<AnnouncementResponse> entries, int page, int size, long totalElements) {}
