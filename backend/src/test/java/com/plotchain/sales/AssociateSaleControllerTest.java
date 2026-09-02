package com.plotchain.sales;

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
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateSaleControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean SaleService saleService;

    // Unlike SaleControllerTest's tokenFor(role) (which mints a random associateId per call),
    // this test needs to know the associateId ahead of time -- it's how we prove
    // AssociateSaleController resolves the caller's OWN id from the JWT, not from a request
    // parameter (this endpoint accepts none).
    private String tokenFor(AssociateRole role, UUID associateId) {
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(role);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void getMySalesReturns200WithThePageForTheCallersOwnJwtAssociateId() throws Exception {
        UUID associateId = UUID.randomUUID();
        UUID saleId = UUID.randomUUID();
        SaleResponse sale = new SaleResponse(
            saleId, UUID.randomUUID(), associateId, "Jane Buyer", "9999999999", null,
            new BigDecimal("600000.00"), UUID.randomUUID(), "L", "RECORDED", null, Instant.now(), null, null,
            null, null, "Sold to Jane Buyer");
        AssociateSalePageResponse page = new AssociateSalePageResponse(List.of(sale), 0, 20, 1);
        when(saleService.getMySales(eq(associateId), eq(0), eq(20))).thenReturn(page);

        mockMvc.perform(get("/api/associates/me/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sales[0].id").value(saleId.toString()))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void getMySalesClampsPageAndSizeTheSameWayTheAdminRegisterDoes() throws Exception {
        UUID associateId = UUID.randomUUID();
        AssociateSalePageResponse page = new AssociateSalePageResponse(List.of(), 0, 100, 0);
        when(saleService.getMySales(eq(associateId), eq(0), eq(100))).thenReturn(page);

        mockMvc.perform(get("/api/associates/me/sales")
                .param("page", "-1")
                .param("size", "500")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.size").value(100));
    }
}
