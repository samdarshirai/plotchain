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

import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
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
}
