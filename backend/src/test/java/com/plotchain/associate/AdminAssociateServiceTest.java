package com.plotchain.associate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.company.SettingsAuditLog;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminAssociateServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock RankTierRepository rankTierRepository;
    @Mock CycleRepository cycleRepository;
    @Mock LegVolumeRepository legVolumeRepository;
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;
    @Mock AssociateStatusCache associateStatusCache;

    PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    AdminAssociateService service;

    private static final UUID ACTOR_ID = UUID.randomUUID();
    private final RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(5000));

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        service = new AdminAssociateService(
            associateRepository, rankTierRepository, cycleRepository, legVolumeRepository,
            passwordEncoder, settingsAuditService, associateStatusCache);
    }

    private Associate newAssociate(UUID id, String userId) {
        Associate a = new Associate();
        a.setId(id);
        a.setUserId(userId);
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setRankId(rank.getId());
        a.setKycStatus(KycStatus.PENDING);
        a.setStatus(AssociateStatus.ACTIVE);
        a.setJoinedAt(Instant.now());
        a.setPasswordHash("hash");
        return a;
    }

    @Test
    void listReturnsAPageMappedToSummaries() {
        Associate associate = newAssociate(UUID.randomUUID(), "VP00001");
        when(associateRepository.searchDirectory(
            eq("jane"), isNull(), isNull(), isNull(), isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(associate), PageRequest.of(0, 20), 1));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));

        AdminAssociatePageResponse response = service.list(
            "jane", null, null, null, null, null, 0, 20);

        assertThat(response.totalElements()).isEqualTo(1);
        assertThat(response.associates()).hasSize(1);
        assertThat(response.associates().get(0).userId()).isEqualTo("VP00001");
        assertThat(response.associates().get(0).rankName()).isEqualTo("Sales Associate");
    }

    @Test
    void listConvertsJoinedDateRangeToAnExclusiveUpperBoundInstant() {
        when(associateRepository.searchDirectory(
            isNull(), isNull(), isNull(), isNull(), any(), any(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());

        service.list(null, null, null, null, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), 0, 20);

        ArgumentCaptor<Instant> fromCaptor = ArgumentCaptor.forClass(Instant.class);
        ArgumentCaptor<Instant> toCaptor = ArgumentCaptor.forClass(Instant.class);
        verify(associateRepository).searchDirectory(
            isNull(), isNull(), isNull(), isNull(), fromCaptor.capture(), toCaptor.capture(), any());
        assertThat(fromCaptor.getValue()).isEqualTo(Instant.parse("2026-01-01T00:00:00Z"));
        // Exclusive upper bound: the day AFTER joinedTo, so Jan 31 itself is included.
        assertThat(toCaptor.getValue()).isEqualTo(Instant.parse("2026-02-01T00:00:00Z"));
    }

    @Test
    void getReturnsFullDetailWithSponsorParentAndLegVolumes() {
        UUID id = UUID.randomUUID();
        UUID sponsorId = UUID.randomUUID();
        UUID parentId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00003");
        associate.setSponsorId(sponsorId);
        associate.setParentId(parentId);
        associate.setPosition("L");
        Associate sponsor = newAssociate(sponsorId, "VP00001");
        Associate parent = newAssociate(parentId, "VP00002");
        Cycle openCycle = new Cycle();
        openCycle.setId(cycleId);
        LegVolume legVolume = LegVolume.empty(id, cycleId);

        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(associateRepository.findById(sponsorId)).thenReturn(Optional.of(sponsor));
        when(associateRepository.findById(parentId)).thenReturn(Optional.of(parent));
        when(rankTierRepository.findById(rank.getId())).thenReturn(Optional.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.of(openCycle));
        when(legVolumeRepository.findByAssociateIdAndCycleId(id, cycleId)).thenReturn(Optional.of(legVolume));
        when(associateRepository.countByParentId(id)).thenReturn(2L);
        when(associateRepository.countDownline(id)).thenReturn(5L);

        AdminAssociateDetailResponse response = service.get(id);

        assertThat(response.sponsorUserId()).isEqualTo("VP00001");
        assertThat(response.parentUserId()).isEqualTo("VP00002");
        assertThat(response.position()).isEqualTo("L");
        assertThat(response.directDownlineCount()).isEqualTo(2);
        assertThat(response.totalDownlineCount()).isEqualTo(5);
        assertThat(response.leftLegVolume()).isEqualTo(BigDecimal.ZERO);
    }

    @Test
    void getThrowsWhenAssociateNotFound() {
        UUID id = UUID.randomUUID();
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.get(id)).isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void suspendSetsStatusAndRecordsAudit() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001");
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findById(rank.getId())).thenReturn(Optional.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());

        AdminAssociateDetailResponse response = service.suspend(id, ACTOR_ID);

        assertThat(associate.getStatus()).isEqualTo(AssociateStatus.SUSPENDED);
        assertThat(response.status()).isEqualTo(AssociateStatus.SUSPENDED);
        verify(associateRepository).save(associate);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        assertThat(captor.getValue().getSection()).isEqualTo("associate");
        assertThat(captor.getValue().getChangedByAssociateId()).isEqualTo(ACTOR_ID);
    }

    @Test
    void suspendEvictsTheAssociateFromTheStatusCache() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001");
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findById(rank.getId())).thenReturn(Optional.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());

        service.suspend(id, ACTOR_ID);

        verify(associateStatusCache).evict(id);
    }

    @Test
    void reactivateSetsStatusBackToActive() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001");
        associate.setStatus(AssociateStatus.SUSPENDED);
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findById(rank.getId())).thenReturn(Optional.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());

        AdminAssociateDetailResponse response = service.reactivate(id, ACTOR_ID);

        assertThat(associate.getStatus()).isEqualTo(AssociateStatus.ACTIVE);
        assertThat(response.status()).isEqualTo(AssociateStatus.ACTIVE);
    }

    @Test
    void reactivateEvictsTheAssociateFromTheStatusCache() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001");
        associate.setStatus(AssociateStatus.SUSPENDED);
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findById(rank.getId())).thenReturn(Optional.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());

        service.reactivate(id, ACTOR_ID);

        verify(associateStatusCache).evict(id);
    }

    @Test
    void resetPasswordGeneratesANewTemporaryPasswordAndSetsMustChangeFlag() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001");
        String originalHash = associate.getPasswordHash();
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));

        ResetPasswordResponse response = service.resetPassword(id, ACTOR_ID);

        assertThat(response.temporaryPassword()).isNotBlank();
        assertThat(associate.getPasswordHash()).isNotEqualTo(originalHash);
        assertThat(passwordEncoder.matches(response.temporaryPassword(), associate.getPasswordHash())).isTrue();
        assertThat(associate.isMustChangePassword()).isTrue();
        verify(associateRepository).save(associate);
    }
}
