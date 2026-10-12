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

    private static final String PAY_BODY = """
        {"amount":100000.00,"paymentRef":"UTR-1","paymentMode":"CASH"}
        """;

    private org.springframework.test.web.servlet.ResultActions pay(UUID bookingId, int n, String body) throws Exception {
        return mockMvc.perform(patch("/api/admin/bookings/{id}/installments/{n}/pay", bookingId, n)
            .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
            .contentType("application/json").content(body));
    }

    @Test
    void payReturns200WithTheUpdatedBookingAndPassesTheAdminAsActor() throws Exception {
        UUID bookingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        BookingResponse updated = new BookingResponse(bookingId, UUID.randomUUID(), UUID.randomUUID(),
            BookingStatus.ACTIVE, "Jane Buyer", new BigDecimal("200000.00"), 2, Instant.now(),
            new BigDecimal("100000.00"), new BigDecimal("100000.00"), List.of());
        when(bookingService.recordPayment(eq(bookingId), eq(1), any(RecordPaymentRequest.class), eq(adminId)))
            .thenReturn(updated);

        mockMvc.perform(patch("/api/admin/bookings/{id}/installments/{n}/pay", bookingId, 1)
                .header("Authorization", "Bearer " + tokenFor(adminId, AssociateRole.ADMIN))
                .contentType("application/json").content(PAY_BODY))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(bookingId.toString()))
            .andExpect(jsonPath("$.paidAmount").value(100000.00));
    }

    @Test
    void payMapsServiceExceptionsToTheSpecStatuses() throws Exception {
        UUID id = UUID.randomUUID();
        when(bookingService.recordPayment(eq(id), eq(1), any(), any())).thenThrow(new BookingNotFoundException(id));
        when(bookingService.recordPayment(eq(id), eq(2), any(), any())).thenThrow(new BookingNotActiveException(id));
        when(bookingService.recordPayment(eq(id), eq(3), any(), any())).thenThrow(new InstallmentNotFoundException(id, 3));
        when(bookingService.recordPayment(eq(id), eq(4), any(), any())).thenThrow(new InstallmentNotPayableException(id, 4));
        when(bookingService.recordPayment(eq(id), eq(5), any(), any()))
            .thenThrow(new PaymentAmountMismatchException(id, 5, new BigDecimal("1.00")));

        pay(id, 1, PAY_BODY).andExpect(status().isNotFound());
        pay(id, 2, PAY_BODY).andExpect(status().isConflict());
        pay(id, 3, PAY_BODY).andExpect(status().isNotFound());
        pay(id, 4, PAY_BODY).andExpect(status().isConflict());
        pay(id, 5, PAY_BODY).andExpect(status().isBadRequest());
    }

    @Test
    void payRejectsInvalidBodiesWith400WithoutCallingTheService() throws Exception {
        UUID id = UUID.randomUUID();
        String longRef = "x".repeat(101);
        for (String body : List.of(
                "{\"paymentRef\":\"UTR-1\"}",                                  // amount missing
                "{\"amount\":0,\"paymentRef\":\"UTR-1\"}",                     // zero
                "{\"amount\":-5.00,\"paymentRef\":\"UTR-1\"}",                 // negative
                "{\"amount\":100.00}",                                         // paymentRef missing
                "{\"amount\":100.00,\"paymentRef\":\"   \"}",                  // blank
                "{\"amount\":100.00,\"paymentRef\":\"" + longRef + "\"}")) {   // > 100
            pay(id, 1, body).andExpect(status().isBadRequest());
        }
        org.mockito.Mockito.verifyNoInteractions(bookingService);
    }

    @Test
    void confirmReturns200WithTheConfirmedBookingAndPassesTheAdminAsActor() throws Exception {
        UUID bookingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        BookingResponse confirmed = new BookingResponse(bookingId, UUID.randomUUID(), UUID.randomUUID(),
            BookingStatus.CONFIRMED, "Jane Buyer", new BigDecimal("200000.00"), 2, Instant.now(),
            BigDecimal.ZERO, new BigDecimal("200000.00"), List.of());
        when(bookingService.confirmBooking(bookingId, adminId)).thenReturn(confirmed);

        mockMvc.perform(post("/api/admin/bookings/{id}/confirm", bookingId)
                .header("Authorization", "Bearer " + tokenFor(adminId, AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(bookingId.toString()))
            .andExpect(jsonPath("$.status").value("CONFIRMED"));
    }

    @Test
    void confirmMapsServiceExceptionsToTheSpecStatuses() throws Exception {
        UUID missing = UUID.randomUUID();
        UUID notActive = UUID.randomUUID();
        UUID plotGone = UUID.randomUUID();
        when(bookingService.confirmBooking(eq(missing), any())).thenThrow(new BookingNotFoundException(missing));
        when(bookingService.confirmBooking(eq(notActive), any())).thenThrow(new BookingNotActiveException(notActive));
        when(bookingService.confirmBooking(eq(plotGone), any())).thenThrow(new PlotNotAvailableException(UUID.randomUUID()));
        String admin = "Bearer " + tokenFor(AssociateRole.ADMIN);

        mockMvc.perform(post("/api/admin/bookings/{id}/confirm", missing).header("Authorization", admin))
            .andExpect(status().isNotFound());
        mockMvc.perform(post("/api/admin/bookings/{id}/confirm", notActive).header("Authorization", admin))
            .andExpect(status().isConflict());
        mockMvc.perform(post("/api/admin/bookings/{id}/confirm", plotGone).header("Authorization", admin))
            .andExpect(status().isConflict());
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
    void confirmPaymentReturns200AndPassesAdminAsActor() throws Exception {
        UUID bookingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        BookingResponse updated = new BookingResponse(bookingId, UUID.randomUUID(), UUID.randomUUID(),
            BookingStatus.ACTIVE, "Jane Buyer", new BigDecimal("200000.00"), 2, Instant.now(),
            new BigDecimal("100000.00"), new BigDecimal("100000.00"), List.of());
        when(bookingService.confirmPayment(bookingId, 2, adminId)).thenReturn(updated);

        mockMvc.perform(post("/api/admin/bookings/{id}/installments/{n}/confirm", bookingId, 2)
                .header("Authorization", "Bearer " + tokenFor(adminId, AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(bookingId.toString()));
    }

    @Test
    void confirmPaymentMapsExceptions() throws Exception {
        UUID id = UUID.randomUUID();
        when(bookingService.confirmPayment(eq(id), eq(1), any())).thenThrow(new BookingNotFoundException(id));
        when(bookingService.confirmPayment(eq(id), eq(2), any())).thenThrow(new InstallmentNotFoundException(id, 2));
        when(bookingService.confirmPayment(eq(id), eq(3), any())).thenThrow(new BookingNotActiveException(id));
        when(bookingService.confirmPayment(eq(id), eq(4), any())).thenThrow(new InstallmentNotEnteredException(id, 4));
        String admin = "Bearer " + tokenFor(AssociateRole.ADMIN);

        int[] expected = {404, 404, 409, 409};
        for (int n = 1; n <= 4; n++) {
            mockMvc.perform(post("/api/admin/bookings/{id}/installments/{n}/confirm", id, n).header("Authorization", admin))
                .andExpect(status().is(expected[n - 1]));
        }
    }

    @Test
    void confirmPaymentIsForbiddenForAnAssociateTokenAndUnauthorizedWithoutOne() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(post("/api/admin/bookings/{id}/installments/1/confirm", id)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/admin/bookings/{id}/installments/1/confirm", id))
            .andExpect(status().isUnauthorized());
        org.mockito.Mockito.verifyNoInteractions(bookingService);
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

    @Test
    void payRejectsMissingOrInvalidPaymentModeAndAcceptsUpi() throws Exception {
        UUID id = UUID.randomUUID();
        pay(id, 1, "{\"amount\":100.00,\"paymentRef\":\"UTR-1\"}").andExpect(status().isBadRequest());
        pay(id, 1, "{\"amount\":100.00,\"paymentRef\":\"UTR-1\",\"paymentMode\":\"BITCOIN\"}")
            .andExpect(status().isBadRequest());
        org.mockito.Mockito.verifyNoInteractions(bookingService);

        when(bookingService.recordPayment(eq(id), eq(1), any(RecordPaymentRequest.class), any()))
            .thenReturn(new BookingResponse(id, UUID.randomUUID(), UUID.randomUUID(), BookingStatus.ACTIVE, "J",
                new BigDecimal("1.00"), 1, Instant.now(), BigDecimal.ZERO, BigDecimal.ONE, List.of()));
        pay(id, 1, "{\"amount\":100.00,\"paymentRef\":\"UTR-1\",\"paymentMode\":\"UPI\"}").andExpect(status().isOk());
        org.mockito.ArgumentCaptor<RecordPaymentRequest> captor =
            org.mockito.ArgumentCaptor.forClass(RecordPaymentRequest.class);
        org.mockito.Mockito.verify(bookingService).recordPayment(eq(id), eq(1), captor.capture(), any());
        org.assertj.core.api.Assertions.assertThat(captor.getValue().paymentMode()).isEqualTo(PaymentMode.UPI);
    }
}
