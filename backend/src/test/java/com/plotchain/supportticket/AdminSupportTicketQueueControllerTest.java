package com.plotchain.supportticket;

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
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminSupportTicketQueueControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;          // token principal lookup
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;
    @MockBean AdminSupportTicketService service;

    private String admin() {
        Associate principal = new Associate();
        principal.setId(UUID.randomUUID());
        principal.setRole(AssociateRole.ADMIN);
        when(associateRepository.findById(principal.getId())).thenReturn(Optional.of(principal));
        return "Bearer " + jwtService.generateToken(principal);
    }

    private static SupportTicketPageResponse emptyPage(int page, int size) {
        return new SupportTicketPageResponse(List.of(), page, size, 0);
    }

    @Test
    void noParamsMeansUnfilteredPageZeroSizeTwenty() throws Exception {
        when(service.list(null, null, 0, 20)).thenReturn(emptyPage(0, 20));
        mockMvc.perform(get("/api/admin/support-tickets").header("Authorization", admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries").isEmpty())
            .andExpect(jsonPath("$.page").value(0))
            .andExpect(jsonPath("$.size").value(20))
            .andExpect(jsonPath("$.totalElements").value(0));
        verify(service).list(null, null, 0, 20);
    }

    @Test
    void bindsStatusAssociateIdPageAndSize() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(service.list(SupportTicketStatus.OPEN, associateId, 2, 5)).thenReturn(emptyPage(2, 5));
        mockMvc.perform(get("/api/admin/support-tickets").header("Authorization", admin())
                .param("status", "OPEN").param("associateId", associateId.toString())
                .param("page", "2").param("size", "5"))
            .andExpect(status().isOk());
        verify(service).list(SupportTicketStatus.OPEN, associateId, 2, 5);
    }

    @Test
    void rowsCarryFullTicketContentAndAssociateIdentity() throws Exception {
        UUID id = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        SupportTicketResponse row = new SupportTicketResponse(id, associateId, "VP00001", "Jane Doe",
            "Wallet blank", "Page is empty", SupportTicketStatus.RESOLVED, "Fixed",
            Instant.parse("2026-06-02T00:00:00Z"), Instant.parse("2026-06-01T00:00:00Z"),
            Instant.parse("2026-06-02T00:00:00Z"));
        when(service.list(null, null, 0, 20)).thenReturn(new SupportTicketPageResponse(List.of(row), 0, 20, 1));
        mockMvc.perform(get("/api/admin/support-tickets").header("Authorization", admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].id").value(id.toString()))
            .andExpect(jsonPath("$.entries[0].associateUserId").value("VP00001"))
            .andExpect(jsonPath("$.entries[0].associateName").value("Jane Doe"))
            .andExpect(jsonPath("$.entries[0].subject").value("Wallet blank"))
            .andExpect(jsonPath("$.entries[0].description").value("Page is empty"))
            .andExpect(jsonPath("$.entries[0].status").value("RESOLVED"))
            .andExpect(jsonPath("$.entries[0].response").value("Fixed"))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void sizeIsClampedToOneThroughOneHundredAndPageToZero() throws Exception {
        when(service.list(any(), any(), anyInt(), anyInt())).thenReturn(emptyPage(0, 1));
        mockMvc.perform(get("/api/admin/support-tickets").header("Authorization", admin())
            .param("size", "0")).andExpect(status().isOk());
        verify(service).list(null, null, 0, 1);
        mockMvc.perform(get("/api/admin/support-tickets").header("Authorization", admin())
            .param("size", "-7")).andExpect(status().isOk());
        mockMvc.perform(get("/api/admin/support-tickets").header("Authorization", admin())
            .param("size", "500").param("page", "-3")).andExpect(status().isOk());
        verify(service).list(null, null, 0, 100);
    }

    @Test
    void badStatusOrBadUuidIs400() throws Exception {
        mockMvc.perform(get("/api/admin/support-tickets").header("Authorization", admin()).param("status", "BOGUS"))
            .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/admin/support-tickets").header("Authorization", admin()).param("associateId", "nope"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void unknownAssociateIdIsAnEmptyPageNot404() throws Exception {
        UUID unknown = UUID.randomUUID();
        when(service.list(null, unknown, 0, 20)).thenReturn(emptyPage(0, 20));
        mockMvc.perform(get("/api/admin/support-tickets").header("Authorization", admin())
                .param("associateId", unknown.toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries").isEmpty());
    }
}
