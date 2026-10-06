package com.plotchain.supportticket;

import org.springframework.web.bind.annotation.RestControllerAdvice;

// Shell created in unit 1 so the per-package advice convention is in place; unit 3 adds the
// SupportTicketNotFoundException -> 404 and InvalidSupportTicketResponseException -> 400
// handlers. AssociateNotFoundException (thrown by create()) is deliberately NOT handled here:
// DashboardExceptionHandler already maps it to 404 globally, and a second mapping would be a
// redundant, order-dependent duplicate (see BookingExceptionHandler's header comment).
@RestControllerAdvice
public class SupportTicketExceptionHandler {
}
