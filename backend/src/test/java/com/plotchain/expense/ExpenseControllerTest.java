package com.plotchain.expense;

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

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ExpenseControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @MockBean AssociateRepository associateRepository;
    @MockBean ExpenseService service;

    private String tokenFor(AssociateRole role) {
        Associate a = new Associate();
        a.setId(UUID.randomUUID());
        a.setRole(role);
        when(associateRepository.findById(a.getId())).thenReturn(Optional.of(a));
        return jwtService.generateToken(a);
    }

    @Test
    void listIsForbiddenForAssociate() throws Exception {
        mockMvc.perform(get("/api/admin/expenses").header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void listIsOkForAdmin() throws Exception {
        when(service.list(null, null, null, null)).thenReturn(List.of());
        mockMvc.perform(get("/api/admin/expenses").header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());
    }

    @Test
    void createRejectsZeroAmountWith400() throws Exception {
        String body = "{\"expenseDate\":\"2026-10-01\",\"expenseTypeId\":\"" + UUID.randomUUID()
            + "\",\"payTo\":\"X\",\"amount\":0,\"payMode\":\"CASH\"}";
        mockMvc.perform(post("/api/admin/expenses").header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json").content(body))
            .andExpect(status().isBadRequest());
    }
}
