package com.plotchain.epin;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatus;
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

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateEPinControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @MockBean AssociateRepository associateRepository;
    @MockBean EPinRepository epinRepository;
    @MockBean EPinEventRepository epinEventRepository;

    private Associate associate(AssociateRole role) {
        Associate a = new Associate();
        a.setId(UUID.randomUUID());
        a.setRole(role);
        a.setStatus(AssociateStatus.ACTIVE);
        when(associateRepository.findById(a.getId())).thenReturn(Optional.of(a));
        return a;
    }

    @Test
    void myEpinsQueriesByTheJwtPrincipalNeverByAParameter() throws Exception {
        Associate me = associate(AssociateRole.ASSOCIATE);
        when(epinRepository.searchForAssociate(any(), any(), any()))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        mockMvc.perform(get("/api/associates/me/epins")
                .param("redeemedTo", UUID.randomUUID().toString()) // ignored: no such parameter exists
                .header("Authorization", "Bearer " + jwtService.generateToken(me)))
            .andExpect(status().isOk());

        verify(epinRepository).searchForAssociate(eq(me.getId()), isNull(), any());
    }

    @Test
    void myEpinsClampsSizeTo100AndAcceptsAStatusFilter() throws Exception {
        Associate me = associate(AssociateRole.ASSOCIATE);
        when(epinRepository.searchForAssociate(any(), any(), any()))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 100), 0));

        mockMvc.perform(get("/api/associates/me/epins").param("size", "9999").param("status", "ALLOCATED")
                .header("Authorization", "Bearer " + jwtService.generateToken(me)))
            .andExpect(status().isOk());

        verify(epinRepository).searchForAssociate(eq(me.getId()), eq(EPinStatus.ALLOCATED), eq(PageRequest.of(0, 100)));
    }

    @Test
    void myEpinsRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/associates/me/epins")).andExpect(status().isUnauthorized());
    }

    @Test
    void redeemReturns200ForTheHolderActivatingAPendingDownlineMember() throws Exception {
        Associate me = associate(AssociateRole.ASSOCIATE);
        EPin pin = new EPin();
        pin.setId(UUID.randomUUID());
        pin.setStatus(EPinStatus.ALLOCATED);
        pin.setAllocatedTo(me.getId());
        when(epinRepository.findByIdForUpdate(pin.getId())).thenReturn(Optional.of(pin));
        Associate target = new Associate();
        target.setId(UUID.randomUUID());
        target.setUserId("VP00042");
        target.setStatus(AssociateStatus.PENDING);
        when(associateRepository.findByUserId("VP00042")).thenReturn(Optional.of(target));
        when(associateRepository.findSelfAndDownline(me.getId())).thenReturn(List.of(me.getId(), target.getId()));

        mockMvc.perform(post("/api/associates/me/epins/" + pin.getId() + "/redeem")
                .header("Authorization", "Bearer " + jwtService.generateToken(me))
                .contentType("application/json").content("{\"userId\":\"VP00042\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("USED"))
            .andExpect(jsonPath("$.redemptionType").value("ACTIVATION"));
    }

    @Test
    void redeemOfSomeoneElsesPinIs404AndABlankUserIdIs400() throws Exception {
        Associate me = associate(AssociateRole.ASSOCIATE);
        EPin theirs = new EPin();
        theirs.setId(UUID.randomUUID());
        theirs.setStatus(EPinStatus.ALLOCATED);
        theirs.setAllocatedTo(UUID.randomUUID());
        when(epinRepository.findByIdForUpdate(theirs.getId())).thenReturn(Optional.of(theirs));
        String token = jwtService.generateToken(me);

        mockMvc.perform(post("/api/associates/me/epins/" + theirs.getId() + "/redeem")
                .header("Authorization", "Bearer " + token)
                .contentType("application/json").content("{\"userId\":\"VP00042\"}"))
            .andExpect(status().isNotFound());
        mockMvc.perform(post("/api/associates/me/epins/" + theirs.getId() + "/redeem")
                .header("Authorization", "Bearer " + token)
                .contentType("application/json").content("{\"userId\":\" \"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void transferReturns200ForTheHolderAndAnAssociateTokenIsNotForbidden() throws Exception {
        Associate me = associate(AssociateRole.ASSOCIATE);
        EPin pin = new EPin();
        pin.setId(UUID.randomUUID());
        pin.setStatus(EPinStatus.ALLOCATED);
        pin.setAllocatedTo(me.getId());
        when(epinRepository.findByIdForUpdate(pin.getId())).thenReturn(Optional.of(pin));
        Associate to = new Associate();
        to.setId(UUID.randomUUID());
        to.setUserId("VP00050");
        to.setStatus(AssociateStatus.ACTIVE);
        when(associateRepository.findByUserId("VP00050")).thenReturn(Optional.of(to));

        mockMvc.perform(post("/api/associates/me/epins/" + pin.getId() + "/transfer")
                .header("Authorization", "Bearer " + jwtService.generateToken(me))
                .contentType("application/json").content("{\"toUserId\":\"VP00050\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.allocatedTo").value(to.getId().toString()));
    }

    @Test
    void transferToSelfIs409() throws Exception {
        Associate me = associate(AssociateRole.ASSOCIATE);
        me.setUserId("VP00001");
        EPin pin = new EPin();
        pin.setId(UUID.randomUUID());
        pin.setStatus(EPinStatus.ALLOCATED);
        pin.setAllocatedTo(me.getId());
        when(epinRepository.findByIdForUpdate(pin.getId())).thenReturn(Optional.of(pin));
        when(associateRepository.findByUserId("VP00001")).thenReturn(Optional.of(me));

        mockMvc.perform(post("/api/associates/me/epins/" + pin.getId() + "/transfer")
                .header("Authorization", "Bearer " + jwtService.generateToken(me))
                .contentType("application/json").content("{\"toUserId\":\"VP00001\"}"))
            .andExpect(status().isConflict());
    }
}
