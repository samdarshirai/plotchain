package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import com.plotchain.projects.PlotNotFoundException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BookingControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean BookingService bookingService;

    private static final String REQUEST_BODY = """
        {"plotId":"%s","associateId":"%s","buyerName":"Jane Buyer","tokenAmount":1000}
        """;

    private String tokenFor(AssociateRole role) {
        return tokenFor(UUID.randomUUID(), role);
    }

    private String tokenFor(UUID id, AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(id);
        associate.setRole(role);
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void createReturns404WhenThePlotDoesNotExist() throws Exception {
        UUID plotId = UUID.randomUUID();
        when(bookingService.createBooking(any(CreateBookingRequest.class)))
            .thenThrow(new PlotNotFoundException(plotId));

        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(plotId, UUID.randomUUID())))
            .andExpect(status().isNotFound());
    }

    @Test
    void createReturns404WhenTheAssociateDoesNotExist() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(bookingService.createBooking(any(CreateBookingRequest.class)))
            .thenThrow(new AssociateNotFoundException(associateId));

        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(UUID.randomUUID(), associateId)))
            .andExpect(status().isNotFound());
    }

    @Test
    void createReturns409WhenThePlotIsNotAvailable() throws Exception {
        UUID plotId = UUID.randomUUID();
        when(bookingService.createBooking(any(CreateBookingRequest.class)))
            .thenThrow(new PlotNotAvailableException(plotId));

        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(plotId, UUID.randomUUID())))
            .andExpect(status().isConflict());
    }

    @Test
    void createIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(UUID.randomUUID(), UUID.randomUUID())))
            .andExpect(status().isForbidden());
    }

    @Test
    void createReturns400WhenBuyerNameIsMissing() throws Exception {
        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"plotId\":\"%s\",\"associateId\":\"%s\"}".formatted(UUID.randomUUID(), UUID.randomUUID())))
            .andExpect(status().isBadRequest());
    }

    @Test
    void createReturns400WhenBuyerNameIsWhitespaceOnly() throws Exception {
        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"plotId\":\"%s\",\"associateId\":\"%s\",\"buyerName\":\"   \"}".formatted(UUID.randomUUID(), UUID.randomUUID())))
            .andExpect(status().isBadRequest());
    }

    @Test
    void createReturns400WhenBuyerNameOrPhoneExceedTheColumnWidths() throws Exception {
        String longName = "x".repeat(201);
        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"plotId\":\"%s\",\"associateId\":\"%s\",\"buyerName\":\"%s\"}".formatted(UUID.randomUUID(), UUID.randomUUID(), longName)))
            .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"plotId\":\"%s\",\"associateId\":\"%s\",\"buyerName\":\"Jane\",\"buyerPhone\":\"%s\"}".formatted(UUID.randomUUID(), UUID.randomUUID(), "9".repeat(21))))
            .andExpect(status().isBadRequest());
    }

    @Test
    void createReturns201WithAFullyPopulatedBookingResponse() throws Exception {
        UUID bookingId = UUID.randomUUID();
        UUID plotId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        BookingResponse response = new BookingResponse(
            bookingId, plotId, associateId, BookingStatus.ACTIVE, "Jane Buyer",
            new BigDecimal("600000.00"), 4, Instant.now(), BigDecimal.ZERO, new BigDecimal("600000.00"),
            List.of(new EmiInstallmentResponse(1, new BigDecimal("150000.00"), LocalDate.now().plusMonths(1),
                InstallmentStatus.PENDING, null, false)));
        when(bookingService.createBooking(any(CreateBookingRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(plotId, associateId)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value(bookingId.toString()))
            .andExpect(jsonPath("$.installmentCount").value(4))
            .andExpect(jsonPath("$.installments[0].installmentNumber").value(1));
    }

    @Test
    void postWithoutDiscountFieldStillBindsAndForwardsNullDiscount() throws Exception {
        when(bookingService.createBooking(any(CreateBookingRequest.class)))
            .thenReturn(new BookingResponse(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), BookingStatus.ACTIVE,
                "Jane Buyer", BigDecimal.TEN, 1, Instant.now(), BigDecimal.ZERO, BigDecimal.TEN, List.of()));

        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(UUID.randomUUID(), UUID.randomUUID())))
            .andExpect(status().isCreated());
        org.mockito.Mockito.verify(bookingService).createBooking(
            org.mockito.ArgumentMatchers.argThat(r -> r.discount() == null));
    }

    @Test
    void postWithDiscountIsForwardedToTheService() throws Exception {
        when(bookingService.createBooking(any(CreateBookingRequest.class)))
            .thenReturn(new BookingResponse(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), BookingStatus.ACTIVE,
                "Jane Buyer", BigDecimal.TEN, 1, Instant.now(), BigDecimal.ZERO, BigDecimal.TEN, List.of()));

        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"plotId\":\"%s\",\"associateId\":\"%s\",\"buyerName\":\"Jane\",\"tokenAmount\":1000,\"discount\":25000}"
                    .formatted(UUID.randomUUID(), UUID.randomUUID())))
            .andExpect(status().isCreated());
        org.mockito.Mockito.verify(bookingService).createBooking(
            org.mockito.ArgumentMatchers.argThat(r -> r.discount() != null && r.discount().compareTo(new BigDecimal("25000")) == 0));
    }

    @Test
    void postWithNegativeDiscountIs400() throws Exception {
        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"plotId\":\"%s\",\"associateId\":\"%s\",\"buyerName\":\"Jane\",\"tokenAmount\":1000,\"discount\":-1}"
                    .formatted(UUID.randomUUID(), UUID.randomUUID())))
            .andExpect(status().isBadRequest());
    }

    // ---- U2: payment confirmation endpoints ----

    private static final String BULK_PATH = "/api/admin/payments/confirm";

    private org.springframework.test.web.servlet.ResultActions bulk(String bearer, String body) throws Exception {
        return mockMvc.perform(post(BULK_PATH).header("Authorization", bearer)
            .contentType("application/json").content(body));
    }

    private static String bulkBody(UUID id) {
        return "{\"items\":[{\"bookingId\":\"" + id + "\",\"installmentNumber\":1}]}";
    }

    @Test
    void bulkConfirmReturns200WithBookingsAndPassesActor() throws Exception {
        UUID bookingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        BookingResponse updated = new BookingResponse(bookingId, UUID.randomUUID(), UUID.randomUUID(),
            BookingStatus.ACTIVE, "Jane Buyer", new BigDecimal("200000.00"), 2, Instant.now(),
            new BigDecimal("100000.00"), new BigDecimal("100000.00"), List.of());
        when(bookingService.confirmPayments(eq(List.of(new PaymentRef(bookingId, 1))), eq(adminId)))
            .thenReturn(List.of(updated));

        bulk("Bearer " + tokenFor(adminId, AssociateRole.ADMIN), bulkBody(bookingId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].id").value(bookingId.toString()));
    }

    @Test
    void bulkConfirmMapsExceptions() throws Exception {
        UUID conflict = UUID.randomUUID();
        UUID missing = UUID.randomUUID();
        UUID dup = UUID.randomUUID();
        when(bookingService.confirmPayments(eq(List.of(new PaymentRef(conflict, 1))), any()))
            .thenThrow(new InstallmentNotEnteredException(conflict, 1));
        when(bookingService.confirmPayments(eq(List.of(new PaymentRef(missing, 1))), any()))
            .thenThrow(new BookingNotFoundException(missing));
        when(bookingService.confirmPayments(eq(List.of(new PaymentRef(dup, 1))), any()))
            .thenThrow(new DuplicatePaymentRefException(dup, 1));
        String admin = "Bearer " + tokenFor(AssociateRole.ADMIN);

        bulk(admin, bulkBody(conflict)).andExpect(status().isConflict());
        bulk(admin, bulkBody(missing)).andExpect(status().isNotFound());
        bulk(admin, bulkBody(dup)).andExpect(status().isBadRequest());
    }

    @Test
    void bulkConfirmIsForbiddenForAnAssociateToken() throws Exception {
        bulk("Bearer " + tokenFor(AssociateRole.ASSOCIATE), bulkBody(UUID.randomUUID()))
            .andExpect(status().isForbidden());
        org.mockito.Mockito.verifyNoInteractions(bookingService);
    }

    @Test
    void bulkConfirmRejectsInvalidBodiesWith400WithoutCallingTheService() throws Exception {
        String admin = "Bearer " + tokenFor(AssociateRole.ADMIN);
        String item = "{\"bookingId\":\"" + UUID.randomUUID() + "\",\"installmentNumber\":1}";
        String tooMany = "{\"items\":[" + String.join(",", java.util.Collections.nCopies(201, item)) + "]}";
        for (String body : List.of(
                "{}", "{\"items\":[]}", "{\"items\":null}", "{\"items\":[null]}", tooMany,
                "{\"items\":[{\"installmentNumber\":1}]}",
                "{\"items\":[{\"bookingId\":\"" + UUID.randomUUID() + "\",\"installmentNumber\":0}]}",
                "{\"items\":[{\"bookingId\":\"not-a-uuid\",\"installmentNumber\":1}]}")) {
            bulk(admin, body).andExpect(status().isBadRequest());
        }
        org.mockito.Mockito.verifyNoInteractions(bookingService);
    }

}
