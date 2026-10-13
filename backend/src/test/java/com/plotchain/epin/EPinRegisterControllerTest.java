package com.plotchain.epin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatus;
import com.plotchain.associate.InvalidTransactionPasswordException;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class EPinRegisterControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @MockBean AssociateRepository associateRepository;
    @MockBean EPinRepository epinRepository;
    @MockBean EPinEventRepository epinEventRepository;
    @MockBean com.plotchain.associate.TransactionPasswordGuard guard;

    private Associate associate(String userId, AssociateStatus status) {
        Associate a = new Associate();
        a.setId(UUID.randomUUID());
        a.setRole(AssociateRole.ASSOCIATE);
        a.setStatus(status);
        a.setUserId(userId);
        a.setName("Name " + userId);
        when(associateRepository.findById(a.getId())).thenReturn(Optional.of(a));
        when(associateRepository.findByUserId(userId)).thenReturn(Optional.of(a));
        return a;
    }

    private String bearer(Associate a) {
        return "Bearer " + jwtService.generateToken(a);
    }

    private String unlock(Associate me) throws Exception {
        String body = mockMvc.perform(post("/api/associates/me/epins/unlock")
                .header("Authorization", bearer(me)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"transactionPassword\":\"pw\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode n = new ObjectMapper().readTree(body);
        return n.get("token").asText();
    }

    @Test
    void registerEndpointsAre403WithoutAnUnlockToken() throws Exception {
        Associate me = associate("SDI1", AssociateStatus.ACTIVE);
        mockMvc.perform(get("/api/associates/me/epins/unused").header("Authorization", bearer(me)))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("EPIN_LOCKED"));
        mockMvc.perform(get("/api/associates/me/epins/used")
                .header("Authorization", bearer(me)).header("X-Epin-Unlock", "bogus"))
            .andExpect(status().isForbidden());
    }

    @Test
    void wrongPasswordDoesNotIssueAToken() throws Exception {
        Associate me = associate("SDI1", AssociateStatus.ACTIVE);
        doThrow(new InvalidTransactionPasswordException("bad")).when(guard).require(any(), any());
        mockMvc.perform(post("/api/associates/me/epins/unlock")
                .header("Authorization", bearer(me)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"transactionPassword\":\"bad\"}"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void tokenIsBoundToTheIssuingAssociate() throws Exception {
        Associate me = associate("SDI1", AssociateStatus.ACTIVE);
        Associate other = associate("SDI2", AssociateStatus.ACTIVE);
        String token = unlock(me);
        mockMvc.perform(get("/api/associates/me/epins/unused")
                .header("Authorization", bearer(other)).header("X-Epin-Unlock", token))
            .andExpect(status().isForbidden());
    }

    @Test
    void unusedListMasksCodeAndShowsCompanyAsTransferBy() throws Exception {
        Associate me = associate("SDI1", AssociateStatus.ACTIVE);
        EPin pin = new EPin();
        pin.setId(UUID.randomUUID());
        pin.setCode("ABCDEF12345");
        pin.setAllocatedAt(Instant.parse("2026-05-04T00:00:00Z"));
        when(epinRepository.searchUnused(any(), any(), any(), any(), any()))
            .thenReturn(new PageImpl<>(List.of(pin), PageRequest.of(0, 20), 1));
        when(epinEventRepository.findFirstByEpinIdAndEventTypeInAndToAssociateIdOrderByAtDesc(any(), any(), any()))
            .thenReturn(Optional.empty());

        mockMvc.perform(get("/api/associates/me/epins/unused").param("masked", "true")
                .header("Authorization", bearer(me)).header("X-Epin-Unlock", unlock(me)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.rows[0].code").value("xxxxxxxxxxxx"))
            .andExpect(jsonPath("$.rows[0].transferBy").value("Company"))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void bulkTransferMovesAllRequestedPinsToTheRecipient() throws Exception {
        Associate me = associate("SDI1", AssociateStatus.ACTIVE);
        Associate to = associate("SDI2", AssociateStatus.ACTIVE);
        EPin a = new EPin(); a.setId(UUID.randomUUID()); a.setAllocatedTo(me.getId());
        EPin b = new EPin(); b.setId(UUID.randomUUID()); b.setAllocatedTo(me.getId());
        when(epinRepository.findHeldForUpdate(any(), any(), any(), any())).thenReturn(List.of(a, b));

        mockMvc.perform(post("/api/associates/me/epins/transfer-bulk")
                .header("Authorization", bearer(me)).header("X-Epin-Unlock", unlock(me))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"count\":2,\"toUserId\":\"SDI2\",\"transactionPassword\":\"pw\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.transferred").value(2));
        org.junit.jupiter.api.Assertions.assertEquals(to.getId(), a.getAllocatedTo());
        org.junit.jupiter.api.Assertions.assertEquals(to.getId(), b.getAllocatedTo());
    }

    @Test
    void bulkTransferIsAllOrNothingWhenTooFewPinsAreHeld() throws Exception {
        Associate me = associate("SDI1", AssociateStatus.ACTIVE);
        associate("SDI2", AssociateStatus.ACTIVE);
        EPin a = new EPin(); a.setId(UUID.randomUUID()); a.setAllocatedTo(me.getId());
        when(epinRepository.findHeldForUpdate(any(), any(), any(), any())).thenReturn(List.of(a));

        mockMvc.perform(post("/api/associates/me/epins/transfer-bulk")
                .header("Authorization", bearer(me)).header("X-Epin-Unlock", unlock(me))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"count\":2,\"toUserId\":\"SDI2\",\"transactionPassword\":\"pw\"}"))
            .andExpect(status().isConflict());
        verify(epinRepository, never()).save(any());
        org.junit.jupiter.api.Assertions.assertEquals(me.getId(), a.getAllocatedTo());
    }
}
