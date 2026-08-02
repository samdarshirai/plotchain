package com.plotchain.associate;

import com.plotchain.company.SettingsAuditService;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class AdminAssociateService {

    private final AssociateRepository associateRepository;
    private final RankTierRepository rankTierRepository;
    private final CycleRepository cycleRepository;
    private final LegVolumeRepository legVolumeRepository;
    private final PasswordEncoder passwordEncoder;
    private final SettingsAuditService settingsAuditService;
    private final AssociateStatusCache associateStatusCache;

    public AdminAssociateService(
        AssociateRepository associateRepository,
        RankTierRepository rankTierRepository,
        CycleRepository cycleRepository,
        LegVolumeRepository legVolumeRepository,
        PasswordEncoder passwordEncoder,
        SettingsAuditService settingsAuditService,
        AssociateStatusCache associateStatusCache
    ) {
        this.associateRepository = associateRepository;
        this.rankTierRepository = rankTierRepository;
        this.cycleRepository = cycleRepository;
        this.legVolumeRepository = legVolumeRepository;
        this.passwordEncoder = passwordEncoder;
        this.settingsAuditService = settingsAuditService;
        this.associateStatusCache = associateStatusCache;
    }

    public AdminAssociatePageResponse list(String search, UUID rankId, KycStatus kycStatus, AssociateStatus status,
                                            LocalDate joinedFrom, LocalDate joinedTo, int page, int size) {
        Instant joinedFromInstant = joinedFrom == null ? null : joinedFrom.atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant joinedToExclusive = joinedTo == null
            ? null : joinedTo.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        String normalizedSearch = (search == null || search.isBlank()) ? null : search;

        Page<Associate> result = associateRepository.searchDirectory(
            normalizedSearch, rankId, kycStatus, status, joinedFromInstant, joinedToExclusive,
            PageRequest.of(page, size));

        Map<UUID, RankTier> ranksById = ranksById();
        List<AdminAssociateSummaryResponse> summaries = result.getContent().stream()
            .map(a -> toSummary(a, ranksById.get(a.getRankId())))
            .toList();
        return new AdminAssociatePageResponse(summaries, page, size, result.getTotalElements());
    }

    public AdminAssociateDetailResponse get(UUID id) {
        return toDetail(findOrThrow(id));
    }

    @Transactional
    public AdminAssociateDetailResponse suspend(UUID id, UUID actorId) {
        Associate associate = findOrThrow(id);
        associate.setStatus(AssociateStatus.SUSPENDED);
        associateRepository.save(associate);
        associateStatusCache.evict(id);
        settingsAuditService.record("associate", "Suspended " + associate.getUserId(),
            Map.of("associateId", id.toString()), actorId);
        return toDetail(associate);
    }

    @Transactional
    public AdminAssociateDetailResponse reactivate(UUID id, UUID actorId) {
        Associate associate = findOrThrow(id);
        associate.setStatus(AssociateStatus.ACTIVE);
        associateRepository.save(associate);
        associateStatusCache.evict(id);
        settingsAuditService.record("associate", "Reactivated " + associate.getUserId(),
            Map.of("associateId", id.toString()), actorId);
        return toDetail(associate);
    }

    @Transactional
    public ResetPasswordResponse resetPassword(UUID id, UUID actorId) {
        Associate associate = findOrThrow(id);
        String temporaryPassword = TemporaryPasswordGenerator.generate();
        associate.setPasswordHash(passwordEncoder.encode(temporaryPassword));
        associate.setMustChangePassword(true);
        associateRepository.save(associate);
        settingsAuditService.record("associate", "Reset password for " + associate.getUserId(),
            Map.of("associateId", id.toString()), actorId);
        return new ResetPasswordResponse(temporaryPassword);
    }

    private Associate findOrThrow(UUID id) {
        return associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)
            .orElseThrow(() -> new AssociateNotFoundException(id));
    }

    private Map<UUID, RankTier> ranksById() {
        return rankTierRepository.findAllByOrderByRankOrder().stream()
            .collect(Collectors.toMap(RankTier::getId, r -> r));
    }

    private AdminAssociateSummaryResponse toSummary(Associate a, RankTier rank) {
        return new AdminAssociateSummaryResponse(
            a.getId(), a.getUserId(), a.getName(), rank == null ? null : rank.getName(),
            a.getKycStatus(), a.getStatus(), a.getJoinedAt(), a.getLastActiveAt());
    }

    private AdminAssociateDetailResponse toDetail(Associate a) {
        RankTier rank = a.getRankId() == null ? null : rankTierRepository.findById(a.getRankId()).orElse(null);
        Associate sponsor = a.getSponsorId() == null ? null : associateRepository.findById(a.getSponsorId()).orElse(null);
        Associate parent = a.getParentId() == null ? null : associateRepository.findById(a.getParentId()).orElse(null);

        Optional<Cycle> openCycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN);
        BigDecimal leftLegVolume = BigDecimal.ZERO;
        BigDecimal rightLegVolume = BigDecimal.ZERO;
        if (openCycle.isPresent()) {
            Optional<LegVolume> legVolume =
                legVolumeRepository.findByAssociateIdAndCycleId(a.getId(), openCycle.get().getId());
            leftLegVolume = legVolume.map(LegVolume::getLeftLegVolume).orElse(BigDecimal.ZERO);
            rightLegVolume = legVolume.map(LegVolume::getRightLegVolume).orElse(BigDecimal.ZERO);
        }

        return new AdminAssociateDetailResponse(
            a.getId(), a.getUserId(), a.getName(), a.getEmail(), a.getPhone(),
            rank == null ? null : rank.getName(), a.getKycStatus(), a.getStatus(),
            a.getJoinedAt(), a.getLastActiveAt(),
            a.getSponsorId(), sponsor == null ? null : sponsor.getUserId(),
            a.getParentId(), parent == null ? null : parent.getUserId(), a.getPosition(),
            associateRepository.countByParentId(a.getId()), associateRepository.countDownline(a.getId()),
            leftLegVolume, rightLegVolume);
    }
}
