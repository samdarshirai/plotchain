package com.plotchain.booking;

import java.util.List;

public record AdminBookingPageResponse(List<BookingResponse> bookings, int page, int size, long totalElements) {}
