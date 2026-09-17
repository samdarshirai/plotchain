package com.plotchain.epin;

import com.fasterxml.jackson.databind.ObjectMapper;
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

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @SpringBootTest + real Spring Security filter chain, mirroring WithdrawalControllerTest's
// pattern -- proves auth/validation/exception-mapping wiring end to end.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class EPinControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean EPinRepository epinRepository;

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void generateBatchReturns201WithTheRequestedCountOfCodesForAnAdminToken() throws Exception {
        when(epinRepository.existsByCode(any())).thenReturn(false);
        when(epinRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        String body = new ObjectMapper().writeValueAsString(new CreateEPinBatchRequest(5));

        mockMvc.perform(post("/api/admin/epins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.count").value(5))
            .andExpect(jsonPath("$.codes.length()").value(5))
            .andExpect(jsonPath("$.batchId").isNotEmpty())
            .andExpect(jsonPath("$.generatedAt").isNotEmpty());
    }

    @Test
    void generateBatchReturns400AndCreatesNoRowsWhenCountIsZero() throws Exception {
        String body = new ObjectMapper().writeValueAsString(new CreateEPinBatchRequest(0));

        mockMvc.perform(post("/api/admin/epins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fields.count").isNotEmpty());

        verify(epinRepository, never()).save(any());
    }

    @Test
    void generateBatchReturns400WhenCountExceeds2000() throws Exception {
        String body = new ObjectMapper().writeValueAsString(new CreateEPinBatchRequest(2001));

        mockMvc.perform(post("/api/admin/epins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fields.count").isNotEmpty());

        verify(epinRepository, never()).save(any());
    }

    @Test
    void generateBatchIsUnauthorizedWithoutAToken() throws Exception {
        String body = new ObjectMapper().writeValueAsString(new CreateEPinBatchRequest(5));

        mockMvc.perform(post("/api/admin/epins")
                .contentType("application/json")
                .content(body))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void generateBatchIsForbiddenForAnAssociateToken() throws Exception {
        String body = new ObjectMapper().writeValueAsString(new CreateEPinBatchRequest(5));

        mockMvc.perform(post("/api/admin/epins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isForbidden());
    }

    @Test
    void listReturns200WithFilters() throws Exception {
        UUID id = UUID.randomUUID();
        UUID batchId = UUID.randomUUID();
        UUID redeemedTo = UUID.randomUUID();
        EPin epin = new EPin();
        epin.setId(id);
        epin.setCode("some-code");
        epin.setBatchId(batchId);
        epin.setStatus(EPinStatus.USED);
        epin.setGeneratedBy(UUID.randomUUID());
        epin.setGeneratedAt(Instant.now());
        epin.setRedeemedTo(redeemedTo);
        epin.setRedeemedBy(UUID.randomUUID());
        epin.setRedeemedAt(Instant.now());
        epin.setRedemptionType(RedemptionType.ACTIVATION);
        when(epinRepository.search(eq(EPinStatus.USED), eq(redeemedTo), eq(batchId), any()))
            .thenReturn(new PageImpl<>(List.of(epin), PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/admin/epins")
                .param("status", "USED")
                .param("redeemedTo", redeemedTo.toString())
                .param("batchId", batchId.toString())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.epins[0].id").value(id.toString()))
            .andExpect(jsonPath("$.epins[0].code").value("some-code"))
            .andExpect(jsonPath("$.epins[0].status").value("USED"))
            .andExpect(jsonPath("$.epins[0].redeemedTo").value(redeemedTo.toString()))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void listReturns200WithAnEmptyPageWhenUnfiltered() throws Exception {
        when(epinRepository.search(isNull(), isNull(), isNull(), any()))
            .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/admin/epins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.epins").isEmpty())
            .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void listClampsAnOversizedPageSizeToTheServerSideMaximum() throws Exception {
        when(epinRepository.search(isNull(), isNull(), isNull(), eq(PageRequest.of(0, 100))))
            .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/admin/epins").param("size", "999999")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        verify(epinRepository).search(isNull(), isNull(), isNull(), eq(PageRequest.of(0, 100)));
    }

    @Test
    void listClampsANegativePageToZeroInsteadOfThrowing() throws Exception {
        when(epinRepository.search(isNull(), isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/admin/epins").param("page", "-5")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        verify(epinRepository).search(isNull(), isNull(), isNull(), eq(PageRequest.of(0, 20)));
    }

    @Test
    void listReturns400ForAnInvalidStatusValue() throws Exception {
        mockMvc.perform(get("/api/admin/epins").param("status", "NOT_A_STATUS")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid value for status"));
    }

    @Test
    void listReturns400ForAnInvalidUuidInRedeemedTo() throws Exception {
        mockMvc.perform(get("/api/admin/epins").param("redeemedTo", "not-a-uuid")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid value for redeemedTo"));
    }

    @Test
    void listIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/epins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void listIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/admin/epins"))
            .andExpect(status().isUnauthorized());
    }
}
