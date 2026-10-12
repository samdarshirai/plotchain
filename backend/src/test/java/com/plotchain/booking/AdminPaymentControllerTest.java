package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminPaymentControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @MockBean AssociateRepository associateRepository;
    @MockBean PaymentLedgerService paymentLedgerService;
    @MockBean BookingService bookingService;

    private String admin() {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ADMIN);
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return "Bearer " + jwtService.generateToken(associate);
    }

    private void stubAny() {
        when(paymentLedgerService.list(any(), any(), any(), any(), anyInt(), anyInt()))
            .thenReturn(new PaymentPageResponse(List.of(), 0, 20, 0, BigDecimal.ZERO, BigDecimal.ZERO));
    }

    @Test
    void noParamsDefaultsToEnteredPage0Size20AndReturnsTheEnvelope() throws Exception {
        stubAny();
        mockMvc.perform(get("/api/admin/payments").header("Authorization", admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.payments").isEmpty())
            .andExpect(jsonPath("$.pageTotal").value(0))
            .andExpect(jsonPath("$.grandTotal").value(0))
            .andExpect(jsonPath("$.totalElements").value(0));
        verify(paymentLedgerService).list(InstallmentStatus.ENTERED, null, null, null, 0, 20);
    }

    @Test
    void statusPaidAndFiltersAreBoundAndForwarded() throws Exception {
        stubAny();
        UUID project = UUID.randomUUID();
        mockMvc.perform(get("/api/admin/payments").header("Authorization", admin())
                .param("status", "PAID").param("from", "2026-06-01").param("to", "2026-06-30")
                .param("projectId", project.toString()).param("page", "2").param("size", "5"))
            .andExpect(status().isOk());
        verify(paymentLedgerService).list(InstallmentStatus.PAID, LocalDate.of(2026, 6, 1),
            LocalDate.of(2026, 6, 30), project, 2, 5);
    }

    @Test
    void statusPendingOrVoidIs400() throws Exception {
        mockMvc.perform(get("/api/admin/payments").header("Authorization", admin()).param("status", "PENDING"))
            .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/admin/payments").header("Authorization", admin()).param("status", "VOID"))
            .andExpect(status().isBadRequest());
        verify(paymentLedgerService, never()).list(any(), any(), any(), any(), anyInt(), anyInt());
    }

    @Test
    void fromAfterToIs400() throws Exception {
        mockMvc.perform(get("/api/admin/payments").header("Authorization", admin())
                .param("from", "2026-06-30").param("to", "2026-06-01"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void sizeIsClampedBetween1And100AndNegativePageToZero() throws Exception {
        stubAny();
        mockMvc.perform(get("/api/admin/payments").header("Authorization", admin()).param("size", "0"))
            .andExpect(status().isOk());
        verify(paymentLedgerService).list(InstallmentStatus.ENTERED, null, null, null, 0, 1);
        mockMvc.perform(get("/api/admin/payments").header("Authorization", admin()).param("size", "500"))
            .andExpect(status().isOk());
        verify(paymentLedgerService).list(InstallmentStatus.ENTERED, null, null, null, 0, 100);
        mockMvc.perform(get("/api/admin/payments").header("Authorization", admin()).param("page", "-3"))
            .andExpect(status().isOk());
        verify(paymentLedgerService).list(InstallmentStatus.ENTERED, null, null, null, 0, 20);
    }
}
