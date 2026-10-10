package com.plotchain.associate;

import com.plotchain.auth.JwtService;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageImpl;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateDownlineControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean RankTierRepository rankTierRepository;
    @MockBean CycleRepository cycleRepository;
    @MockBean LegVolumeRepository legVolumeRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;

    private final Associate caller = new Associate();

    private String token() {
        caller.setId(UUID.randomUUID());
        caller.setRole(AssociateRole.ASSOCIATE);
        when(associateRepository.findById(caller.getId())).thenReturn(Optional.of(caller));
        return jwtService.generateToken(caller);
    }

    @Test
    void scopesToDownlineExcludingSelf() throws Exception {
        String token = token();
        UUID childId = UUID.randomUUID();
        when(associateRepository.findSelfAndDownline(caller.getId())).thenReturn(List.of(caller.getId(), childId));
        Associate child = new Associate();
        child.setId(childId);
        child.setUserId("VP00002");
        child.setName("Child");
        child.setRole(AssociateRole.ASSOCIATE);
        child.setKycStatus(KycStatus.VERIFIED);
        child.setStatus(AssociateStatus.ACTIVE);
        child.setJoinedAt(Instant.now());
        when(associateRepository.searchWithinIds(any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any()))
            .thenReturn(new PageImpl<>(List.of(child)));

        mockMvc.perform(get("/api/associates/me/downline?kycStatus=VERIFIED")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(1))
            .andExpect(jsonPath("$.associates[0].userId").value("VP00002"));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<UUID>> ids = ArgumentCaptor.forClass(List.class);
        verify(associateRepository).searchWithinIds(ids.capture(), any(), eq(KycStatus.VERIFIED), any(), any(), any(), any(), anyBoolean(), any());
        assertThat(ids.getValue()).containsExactly(childId);
    }

    @Test
    void legScopesToThatSidesSubtree() throws Exception {
        String token = token();
        UUID leftId = UUID.randomUUID(), rightId = UUID.randomUUID(), deepId = UUID.randomUUID();
        Associate left = new Associate();
        left.setId(leftId);
        left.setPosition("L");
        Associate right = new Associate();
        right.setId(rightId);
        right.setPosition("R");
        when(associateRepository.findByParentId(caller.getId())).thenReturn(List.of(left, right));
        when(associateRepository.findSelfAndDownline(leftId)).thenReturn(List.of(leftId, deepId));
        when(associateRepository.searchWithinIds(any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any()))
            .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/associates/me/downline?leg=L").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<UUID>> ids = ArgumentCaptor.forClass(List.class);
        verify(associateRepository).searchWithinIds(ids.capture(), any(), any(), any(), any(), any(), any(), anyBoolean(), any());
        assertThat(ids.getValue()).containsExactly(leftId, deepId);
    }

    @Test
    void legWithNoChildOnThatSideIsEmpty() throws Exception {
        String token = token();
        when(associateRepository.findByParentId(caller.getId())).thenReturn(List.of());

        mockMvc.perform(get("/api/associates/me/downline?leg=R").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(0));
        verify(associateRepository, never()).searchWithinIds(any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any());
    }

    @Test
    void emptyDownlineSkipsQuery() throws Exception {
        String token = token();
        when(associateRepository.findSelfAndDownline(caller.getId())).thenReturn(List.of(caller.getId()));

        mockMvc.perform(get("/api/associates/me/downline").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(0));
        verify(associateRepository, never()).searchWithinIds(any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any());
    }

    @Test
    void unauthenticatedRejected() throws Exception {
        mockMvc.perform(get("/api/associates/me/downline")).andExpect(status().is4xxClientError());
    }
}
