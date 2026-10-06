package com.plotchain.supportticket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import com.plotchain.company.SettingsAuditLogRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminSupportTicketControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @Autowired ObjectMapper objectMapper;

    @MockBean AssociateRepository associateRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;
    @MockBean SupportTicketRepository supportTicketRepository;

    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    private String tokenFor(AssociateRole role) {
        Associate principal = new Associate();
        principal.setId(UUID.randomUUID());
        principal.setRole(role);
        when(associateRepository.findById(principal.getId())).thenReturn(Optional.of(principal));
        return "Bearer " + jwtService.generateToken(principal);
    }

    private void seedTargetAssociate() {
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(a));
        when(supportTicketRepository.save(any(SupportTicket.class))).thenAnswer(i -> i.getArgument(0));
    }

    private String json(Object associateId, String subject, String description) throws Exception {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("associateId", associateId);
        body.put("subject", subject);
        body.put("description", description);
        return objectMapper.writeValueAsString(body);
    }

    @Test
    void adminCreateReturns201WithTheOpenTicket() throws Exception {
        seedTargetAssociate();
        mockMvc.perform(post("/api/admin/support-tickets")
                .header("Authorization", tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(json(ASSOCIATE_ID, "Wallet blank", "Page is empty")))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("OPEN"))
            .andExpect(jsonPath("$.response").doesNotExist())
            .andExpect(jsonPath("$.associateUserId").value("VP00001"))
            .andExpect(jsonPath("$.associateName").value("Jane Doe"))
            .andExpect(jsonPath("$.subject").value("Wallet blank"));
    }

    @Test
    void associateTokenIsForbidden() throws Exception {
        seedTargetAssociate();
        mockMvc.perform(post("/api/admin/support-tickets")
                .header("Authorization", tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content(json(ASSOCIATE_ID, "s", "d")))
            .andExpect(status().isForbidden());
        verify(supportTicketRepository, never()).save(any());
    }

    @Test
    void unauthenticatedIsUnauthorized() throws Exception {
        mockMvc.perform(post("/api/admin/support-tickets")
                .contentType("application/json")
                .content(json(ASSOCIATE_ID, "s", "d")))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void unknownAssociateIs404AndWritesNothing() throws Exception {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.empty());
        mockMvc.perform(post("/api/admin/support-tickets")
                .header("Authorization", tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(json(ASSOCIATE_ID, "s", "d")))
            .andExpect(status().isNotFound());
        verify(supportTicketRepository, never()).save(any());
    }

    @Test
    void blankSubjectIs400() throws Exception {
        seedTargetAssociate();
        mockMvc.perform(post("/api/admin/support-tickets")
                .header("Authorization", tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(json(ASSOCIATE_ID, "   ", "d")))
            .andExpect(status().isBadRequest());
    }

    @Test
    void blankDescriptionIs400() throws Exception {
        seedTargetAssociate();
        mockMvc.perform(post("/api/admin/support-tickets")
                .header("Authorization", tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(json(ASSOCIATE_ID, "s", "")))
            .andExpect(status().isBadRequest());
    }

    @Test
    void missingAssociateIdIs400() throws Exception {
        mockMvc.perform(post("/api/admin/support-tickets")
                .header("Authorization", tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(json(null, "s", "d")))
            .andExpect(status().isBadRequest());
    }

    @Test
    void subjectOver200CharsIs400NotA500() throws Exception {
        seedTargetAssociate();
        mockMvc.perform(post("/api/admin/support-tickets")
                .header("Authorization", tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(json(ASSOCIATE_ID, "x".repeat(201), "d")))
            .andExpect(status().isBadRequest());
    }
}
