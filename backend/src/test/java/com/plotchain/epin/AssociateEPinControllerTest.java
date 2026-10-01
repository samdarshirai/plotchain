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
}
