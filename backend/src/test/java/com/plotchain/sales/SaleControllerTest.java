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
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
        {"plotId":"%s","associateId":"%s","buyerName":"Jane Buyer","buyerPhone":"9999999999","buyerEmail":null,\
        "projectId":"%s","price":600000.00,"note":"Sold to Jane Buyer"}
        """;

    private String requestBody(UUID plotId, UUID associateId) {
        return REQUEST_BODY.formatted(plotId, associateId, UUID.randomUUID());
    }

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
                .content(requestBody(plotId, UUID.randomUUID())))
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
                .content(requestBody(UUID.randomUUID(), associateId)))
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
                .content(requestBody(plotId, UUID.randomUUID())))
            .andExpect(status().isConflict());
    }

    @Test
    void recordIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content(requestBody(UUID.randomUUID(), UUID.randomUUID())))
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
            new BigDecimal("600000.00"), cycleId, "L", "RECORDED", null, Instant.now(), null, null,
            null, null, "Sold to Jane Buyer");
        when(saleService.recordSale(any(CreateSaleRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(requestBody(plotId, associateId)))
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
    void voidReturns200WithAFullyPopulatedSaleResponseReflectingTheReversal() throws Exception {
        UUID saleId = UUID.randomUUID();
        UUID plotId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        SaleResponse response = new SaleResponse(
            saleId, plotId, associateId, "Jane Buyer", "9999999999", null,
            new BigDecimal("600000.00"), cycleId, "L", "VOIDED", "Buyer backed out", Instant.now(), null, null,
            null, null, "Sold to Jane Buyer");
        when(saleService.voidSale(eq(saleId), any(VoidSaleRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/admin/sales/{id}/void", saleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"reason\":\"Buyer backed out\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(saleId.toString()))
            .andExpect(jsonPath("$.status").value("VOIDED"))
            .andExpect(jsonPath("$.voidReason").value("Buyer backed out"));
    }

    @Test
    void voidIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/admin/sales/{id}/void", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content("{\"reason\":\"Buyer backed out\"}"))
            .andExpect(status().isForbidden());
    }

    @Test
    void listReturns200WithFilters() throws Exception {
        UUID saleId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        SaleResponse sale = new SaleResponse(
            saleId, UUID.randomUUID(), associateId, "Jane Buyer", "9999999999", null,
            new BigDecimal("600000.00"), UUID.randomUUID(), "L", "RECORDED", null, Instant.now(), null, null,
            null, null, "Sold to Jane Buyer");
        AdminSalePageResponse page = new AdminSalePageResponse(List.of(sale), 0, 20, 1);
        when(saleService.list(eq(associateId), eq(SaleStatus.RECORDED), any(), any(), eq(0), eq(20)))
            .thenReturn(page);

        mockMvc.perform(get("/api/admin/sales")
                .param("associateId", associateId.toString())
                .param("status", "RECORDED")
                .param("recordedFrom", "2026-01-01")
                .param("recordedTo", "2026-01-31")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sales[0].id").value(saleId.toString()))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void listIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    // Mandatory-fields change on /admin/sales/new: buyerName, projectId, price, and note are the
    // only required fields now -- bean validation on CreateSaleRequest rejects a request missing
    // any of them with 400, before saleService.recordSale is ever reached.
    @Test
    void recordReturns400WhenProjectIdIsMissing() throws Exception {
        String body = """
            {"associateId":"%s","buyerName":"Jane Buyer","price":600000.00,"note":"Sold to Jane Buyer"}
            """.formatted(UUID.randomUUID());

        mockMvc.perform(post("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isBadRequest());
    }

    @Test
    void recordReturns400WhenPriceIsMissing() throws Exception {
        String body = """
            {"associateId":"%s","buyerName":"Jane Buyer","projectId":"%s","note":"Sold to Jane Buyer"}
            """.formatted(UUID.randomUUID(), UUID.randomUUID());

        mockMvc.perform(post("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isBadRequest());
    }

    @Test
    void recordReturns400WhenNoteIsMissing() throws Exception {
        String body = """
            {"associateId":"%s","buyerName":"Jane Buyer","projectId":"%s","price":600000.00}
            """.formatted(UUID.randomUUID(), UUID.randomUUID());

        mockMvc.perform(post("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isBadRequest());
    }

    // plotId and buyerPhone are optional now -- omitting both must still pass validation and
    // reach saleService.recordSale (a 404 from the mocked plotless-friendly service below proves
    // the request cleared validation; recordReturns201WithAFullyPopulatedSaleResponse above
    // already proves the 201 path when a response is stubbed).
    @Test
    void recordAcceptsARequestWithNoPlotIdAndNoBuyerPhone() throws Exception {
        UUID saleId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        SaleResponse response = new SaleResponse(
            saleId, null, associateId, "Jane Buyer", null, null,
            new BigDecimal("600000.00"), cycleId, "L", "RECORDED", null, Instant.now(), null, "Green Valley",
            null, null, "Sold to Jane Buyer");
        when(saleService.recordSale(any(CreateSaleRequest.class))).thenReturn(response);
        String body = """
            {"associateId":"%s","buyerName":"Jane Buyer","projectId":"%s","price":600000.00,"note":"Sold to Jane Buyer"}
            """.formatted(associateId, UUID.randomUUID());

        mockMvc.perform(post("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.plotId").value(org.hamcrest.Matchers.nullValue()))
            .andExpect(jsonPath("$.projectName").value("Green Valley"));
    }
}
