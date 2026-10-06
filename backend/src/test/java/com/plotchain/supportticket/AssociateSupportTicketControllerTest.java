package com.plotchain.supportticket;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Real AssociateSupportTicketService over mocked repositories, so the caller-only scoping is
// proven end to end from the JWT.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateSupportTicketControllerTest {

    static final String URL = "/api/associates/me/support-tickets";

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean SupportTicketRepository supportTicketRepository;

    private Associate associate(UUID id, AssociateRole role, String userId, String name) {
        Associate a = new Associate();
        a.setId(id);
        a.setRole(role);
        a.setUserId(userId);
        a.setName(name);
        when(associateRepository.findById(id)).thenReturn(Optional.of(a));
        return a;
    }

    private String tokenFor(Associate a) {
        return "Bearer " + jwtService.generateToken(a);
    }

    private SupportTicket ticket(UUID associateId, String subject, SupportTicketStatus status) {
        SupportTicket t = new SupportTicket();
        t.setId(UUID.randomUUID());
        t.setAssociateId(associateId);
        t.setSubject(subject);
        t.setDescription("Desc");
        t.setStatus(status);
        t.setCreatedAt(Instant.now());
        t.setUpdatedAt(Instant.now());
        return t;
    }

    @Test
    void returnsOnlyTheCallersTicketsAndQueriesByTheJwtAssociateId() throws Exception {
        UUID meId = UUID.randomUUID();
        UUID otherId = UUID.randomUUID();
        Associate me = associate(meId, AssociateRole.ASSOCIATE, "VP00001", "Jane Doe");
        associate(otherId, AssociateRole.ASSOCIATE, "VP00002", "Other Person");
        when(supportTicketRepository.searchQueue(eq(null), eq(meId), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(ticket(meId, "Mine", SupportTicketStatus.OPEN)), PageRequest.of(0, 20), 1));

        mockMvc.perform(get(URL).header("Authorization", tokenFor(me)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries.length()").value(1))
            .andExpect(jsonPath("$.entries[0].subject").value("Mine"))
            .andExpect(jsonPath("$.entries[0].associateUserId").value("VP00001"))
            .andExpect(jsonPath("$.entries[0].associateName").value("Jane Doe"))
            .andExpect(jsonPath("$.totalElements").value(1));
        verify(supportTicketRepository, never()).searchQueue(any(), eq(otherId), any());
    }

    @Test
    void anAssociateIdQueryParamIsIgnoredSoNoOneCanReadAnotherAssociatesTickets() throws Exception {
        UUID meId = UUID.randomUUID();
        UUID otherId = UUID.randomUUID();
        Associate me = associate(meId, AssociateRole.ASSOCIATE, "VP00001", "Jane Doe");
        when(supportTicketRepository.searchQueue(any(), any(), any())).thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get(URL).param("associateId", otherId.toString()).header("Authorization", tokenFor(me)))
            .andExpect(status().isOk());
        verify(supportTicketRepository).searchQueue(any(), eq(meId), any());
        verify(supportTicketRepository, never()).searchQueue(any(), eq(otherId), any());
    }

    @Test
    void statusParamIsPassedAsTheFilter() throws Exception {
        UUID meId = UUID.randomUUID();
        Associate me = associate(meId, AssociateRole.ASSOCIATE, "VP00001", "Jane Doe");
        when(supportTicketRepository.searchQueue(eq(SupportTicketStatus.RESOLVED), eq(meId), any()))
            .thenReturn(new PageImpl<>(List.of(ticket(meId, "Done one", SupportTicketStatus.RESOLVED))));

        mockMvc.perform(get(URL).param("status", "RESOLVED").header("Authorization", tokenFor(me)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].status").value("RESOLVED"));
    }

    @Test
    void emptyHistoryIs200WithAnEmptyEntriesList() throws Exception {
        UUID meId = UUID.randomUUID();
        Associate me = associate(meId, AssociateRole.ASSOCIATE, "VP00001", "Jane Doe");
        when(supportTicketRepository.searchQueue(any(), eq(meId), any())).thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get(URL).header("Authorization", tokenFor(me)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries.length()").value(0))
            .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void clampsNegativePageZeroSizeAndOversizedSize() throws Exception {
        UUID meId = UUID.randomUUID();
        Associate me = associate(meId, AssociateRole.ASSOCIATE, "VP00001", "Jane Doe");
        when(supportTicketRepository.searchQueue(any(), eq(meId), any())).thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get(URL).param("page", "-1").param("size", "500").header("Authorization", tokenFor(me)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.size").value(100)).andExpect(jsonPath("$.page").value(0));
        mockMvc.perform(get(URL).param("size", "0").header("Authorization", tokenFor(me)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.size").value(1));
        mockMvc.perform(get(URL).param("size", "-5").header("Authorization", tokenFor(me)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.size").value(1));
    }

    @Test
    void anUnknownStatusValueIsA400NotA500() throws Exception {
        Associate me = associate(UUID.randomUUID(), AssociateRole.ASSOCIATE, "VP00001", "Jane Doe");
        mockMvc.perform(get(URL).param("status", "BOGUS").header("Authorization", tokenFor(me)))
            .andExpect(status().isBadRequest());
    }

    @Test
    void anAdminTokenReachesTheRouteUngatedAndSeesItsOwnEmptyHistory() throws Exception {
        UUID adminId = UUID.randomUUID();
        Associate admin = associate(adminId, AssociateRole.ADMIN, "ADMIN01", "Admin");
        when(supportTicketRepository.searchQueue(any(), eq(adminId), any())).thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get(URL).header("Authorization", tokenFor(admin))).andExpect(status().isOk());
    }

    @Test
    void unauthenticatedIs401() throws Exception {
        mockMvc.perform(get(URL)).andExpect(status().isUnauthorized());
    }

    @Test
    void thereIsNoWriteRouteForAssociatesOnTheirTicketHistory() throws Exception {
        Associate me = associate(UUID.randomUUID(), AssociateRole.ASSOCIATE, "VP00001", "Jane Doe");
        mockMvc.perform(post(URL).contentType("application/json").content("{}").header("Authorization", tokenFor(me)))
            .andExpect(status().is4xxClientError());
        verify(supportTicketRepository, never()).save(any());
    }
}
