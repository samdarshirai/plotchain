package com.plotchain.sales;

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
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SaleControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean SaleService saleService;

    private static final String REQUEST_BODY = """
        {"plotId":"%s","associateId":"%s","buyerName":"Jane Buyer","buyerPhone":"9999999999","buyerEmail":null}
        """;

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void recordReturns404WhenThePlotDoesNotExist() throws Exception {
        UUID plotId = UUID.randomUUID();
        when(saleService.recordSale(any(CreateSaleRequest.class)))
            .thenThrow(new PlotNotFoundException(plotId));

        mockMvc.perform(post("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(plotId, UUID.randomUUID())))
            .andExpect(status().isNotFound());
    }

    @Test
    void recordReturns404WhenTheAssociateDoesNotExist() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(saleService.recordSale(any(CreateSaleRequest.class)))
            .thenThrow(new AssociateNotFoundException(associateId));

        mockMvc.perform(post("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(UUID.randomUUID(), associateId)))
            .andExpect(status().isNotFound());
    }

    @Test
    void recordReturns409WhenThePlotIsNotAvailable() throws Exception {
        UUID plotId = UUID.randomUUID();
        when(saleService.recordSale(any(CreateSaleRequest.class)))
            .thenThrow(new PlotNotAvailableException(plotId));

        mockMvc.perform(post("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(plotId, UUID.randomUUID())))
            .andExpect(status().isConflict());
    }

    @Test
    void recordIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(UUID.randomUUID(), UUID.randomUUID())))
            .andExpect(status().isForbidden());
    }

    @Test
    void recordReturns201WithAFullyPopulatedSaleResponse() throws Exception {
        UUID saleId = UUID.randomUUID();
        UUID plotId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        SaleResponse response = new SaleResponse(
            saleId, plotId, associateId, "Jane Buyer", "9999999999", null,
            new BigDecimal("600000.00"), cycleId, "L", "RECORDED", null, Instant.now());
        when(saleService.recordSale(any(CreateSaleRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(plotId, associateId)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value(saleId.toString()))
            .andExpect(jsonPath("$.status").value("RECORDED"))
            .andExpect(jsonPath("$.legCredited").value("L"))
            .andExpect(jsonPath("$.cycleId").value(cycleId.toString()));
    }

    @Test
    void voidReturns404WhenTheSaleDoesNotExist() throws Exception {
        UUID saleId = UUID.randomUUID();
        when(saleService.voidSale(eq(saleId), any(VoidSaleRequest.class)))
            .thenThrow(new SaleNotFoundException(saleId));

        mockMvc.perform(post("/api/admin/sales/{id}/void", saleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"reason\":\"Buyer backed out\"}"))
            .andExpect(status().isNotFound());
    }

    @Test
    void voidReturns409WhenTheSaleIsAlreadyVoided() throws Exception {
        UUID saleId = UUID.randomUUID();
        when(saleService.voidSale(eq(saleId), any(VoidSaleRequest.class)))
            .thenThrow(new SaleAlreadyVoidedException(saleId));

        mockMvc.perform(post("/api/admin/sales/{id}/void", saleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"reason\":\"Buyer backed out\"}"))
            .andExpect(status().isConflict());
    }

    @Test
    void voidIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/admin/sales/{id}/void", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content("{\"reason\":\"Buyer backed out\"}"))
            .andExpect(status().isForbidden());
    }
}
