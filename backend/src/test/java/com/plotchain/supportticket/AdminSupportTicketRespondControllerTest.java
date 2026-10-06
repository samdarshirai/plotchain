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

import java.time.Instant;
import java.util.HashMap;
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
class AdminSupportTicketRespondControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @Autowired ObjectMapper objectMapper;

    @MockBean AssociateRepository associateRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;
    @MockBean SupportTicketRepository supportTicketRepository;

    private static final UUID TICKET_ID = UUID.randomUUID();
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    private String tokenFor(AssociateRole role) {
        Associate principal = new Associate();
        principal.setId(UUID.randomUUID());
        principal.setRole(role);
        when(associateRepository.findById(principal.getId())).thenReturn(Optional.of(principal));
        return "Bearer " + jwtService.generateToken(principal);
    }

    private void seedTicket() {
        SupportTicket t = new SupportTicket();
        t.setId(TICKET_ID);
        t.setAssociateId(ASSOCIATE_ID);
        t.setSubject("Wallet blank");
        t.setDescription("Page is empty");
        t.setStatus(SupportTicketStatus.OPEN);
        t.setCreatedAt(Instant.now());
        t.setUpdatedAt(Instant.now());
        when(supportTicketRepository.findById(TICKET_ID)).thenReturn(Optional.of(t));
        when(supportTicketRepository.save(any(SupportTicket.class))).thenAnswer(i -> i.getArgument(0));
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(a));
    }

    private String json(Object status, Object response) throws Exception {
        Map<String, Object> body = new HashMap<>();
        if (status != null) body.put("status", status);
        if (response != null) body.put("response", response);
        return objectMapper.writeValueAsString(body);
    }

    private org.springframework.test.web.servlet.ResultActions respond(UUID id, String token, String body) throws Exception {
        var req = post("/api/admin/support-tickets/{id}/respond", id).contentType("application/json").content(body);
        if (token != null) req = req.header("Authorization", token);
        return mockMvc.perform(req);
    }

    @Test
    void adminRespondReturns200WithTheUpdatedTicket() throws Exception {
        seedTicket();
        respond(TICKET_ID, tokenFor(AssociateRole.ADMIN), json("RESOLVED", "Fixed"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(TICKET_ID.toString()))
            .andExpect(jsonPath("$.status").value("RESOLVED"))
            .andExpect(jsonPath("$.response").value("Fixed"))
            .andExpect(jsonPath("$.respondedAt").exists())
            .andExpect(jsonPath("$.associateUserId").value("VP00001"));
    }

    @Test
    void statusOnlyChangeReturns200() throws Exception {
        seedTicket();
        respond(TICKET_ID, tokenFor(AssociateRole.ADMIN), json("IN_PROGRESS", null))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("IN_PROGRESS"))
            .andExpect(jsonPath("$.response").doesNotExist());
    }

    @Test
    void associateTokenIsForbiddenAndWritesNothing() throws Exception {
        seedTicket();
        respond(TICKET_ID, tokenFor(AssociateRole.ASSOCIATE), json("RESOLVED", "x")).andExpect(status().isForbidden());
        verify(supportTicketRepository, never()).save(any());
    }

    @Test
    void unauthenticatedIsUnauthorized() throws Exception {
        respond(TICKET_ID, null, json("RESOLVED", "x")).andExpect(status().isUnauthorized());
    }

    @Test
    void unknownTicketIs404AndWritesNothing() throws Exception {
        when(supportTicketRepository.findById(TICKET_ID)).thenReturn(Optional.empty());
        respond(TICKET_ID, tokenFor(AssociateRole.ADMIN), json("IN_PROGRESS", null))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").exists());
        verify(supportTicketRepository, never()).save(any());
    }

    @Test
    void missingStatusIs400() throws Exception {
        seedTicket();
        respond(TICKET_ID, tokenFor(AssociateRole.ADMIN), json(null, "text")).andExpect(status().isBadRequest());
        verify(supportTicketRepository, never()).save(any());
    }

    @Test
    void unknownStatusValueIs400NotA500() throws Exception {
        seedTicket();
        respond(TICKET_ID, tokenFor(AssociateRole.ADMIN), json("BOGUS", "text")).andExpect(status().isBadRequest());
    }

    @Test
    void resolvedWithBlankResponseIs400() throws Exception {
        seedTicket();
        respond(TICKET_ID, tokenFor(AssociateRole.ADMIN), json("RESOLVED", "   "))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").exists());
        verify(supportTicketRepository, never()).save(any());
    }

    @Test
    void closedWithNoResponseFieldIs400() throws Exception {
        seedTicket();
        respond(TICKET_ID, tokenFor(AssociateRole.ADMIN), json("CLOSED", null)).andExpect(status().isBadRequest());
    }

    @Test
    void malformedTicketIdInPathIs400NotA500() throws Exception {
        mockMvc.perform(post("/api/admin/support-tickets/not-a-uuid/respond")
                .header("Authorization", tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(json("IN_PROGRESS", null)))
            .andExpect(status().isBadRequest());
    }
}
