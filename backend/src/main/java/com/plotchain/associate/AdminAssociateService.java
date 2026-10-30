package com.plotchain.associate;

import com.plotchain.company.SettingsAuditService;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.DesignationService;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class AdminAssociateService {

    private final AssociateRepository associateRepository;
    private final DesignationService designationService;
    private final CycleRepository cycleRepository;
    private final LegVolumeRepository legVolumeRepository;
    private final PasswordEncoder passwordEncoder;
    private final SettingsAuditService settingsAuditService;
    private final AssociateStatusCache associateStatusCache;
    private final AssociateBankDetailsService bankDetailsService;
    private final AssociateNomineeService nomineeService;

    public AdminAssociateService(
        AssociateRepository associateRepository,
        DesignationService designationService,
        CycleRepository cycleRepository,
        LegVolumeRepository legVolumeRepository,
        PasswordEncoder passwordEncoder,
        SettingsAuditService settingsAuditService,
        AssociateStatusCache associateStatusCache,
        AssociateBankDetailsService bankDetailsService,
        AssociateNomineeService nomineeService
    ) {
        this.associateRepository = associateRepository;
        this.designationService = designationService;
        this.cycleRepository = cycleRepository;
        this.legVolumeRepository = legVolumeRepository;
        this.passwordEncoder = passwordEncoder;
        this.settingsAuditService = settingsAuditService;
        this.associateStatusCache = associateStatusCache;
        this.bankDetailsService = bankDetailsService;
        this.nomineeService = nomineeService;
    }

    public AdminAssociatePageResponse list(String search, UUID rankId, KycStatus kycStatus, KycStatus excludeKycStatus,
                                            AssociateStatus status, LocalDate joinedFrom, LocalDate joinedTo,
                                            boolean newestFirst, String leg, int page, int size) {
        Instant joinedFromInstant = joinedFrom == null ? null : joinedFrom.atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant joinedToExclusive = joinedTo == null
            ? null : joinedTo.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        String normalizedSearch = (search == null || search.isBlank()) ? null : search;

        Page<Associate> result = associateRepository.searchDirectory(
            normalizedSearch, rankId, kycStatus, excludeKycStatus, status, joinedFromInstant, joinedToExclusive,
            newestFirst, leg, PageRequest.of(page, size));

        List<AdminAssociateSummaryResponse> summaries = toSummaries(result.getContent());
        return new AdminAssociatePageResponse(summaries, page, size, result.getTotalElements());
    }

    // My Team: same filters as list(), scoped to callerId's downline (self excluded, any depth).
    public AdminAssociatePageResponse listDownline(UUID callerId, String search, KycStatus kycStatus,
                                                    KycStatus excludeKycStatus, AssociateStatus status,
                                                    LocalDate joinedFrom, LocalDate joinedTo,
                                                    boolean newestFirst, String leg, int page, int size) {
        // leg L/R: only the caller's child on that side and everything beneath it.
        List<UUID> ids = leg == null
            ? associateRepository.findSelfAndDownline(callerId).stream().filter(id -> !id.equals(callerId)).toList()
            : associateRepository.findByParentId(callerId).stream()
                .filter(c -> leg.equals(c.getPosition()))
                .flatMap(c -> associateRepository.findSelfAndDownline(c.getId()).stream()).toList();
        if (ids.isEmpty()) {
            return new AdminAssociatePageResponse(List.of(), page, size, 0);
        }
        Instant joinedFromInstant = joinedFrom == null ? null : joinedFrom.atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant joinedToExclusive = joinedTo == null
            ? null : joinedTo.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        String normalizedSearch = (search == null || search.isBlank()) ? null : search;

        Page<Associate> result = associateRepository.searchWithinIds(
            ids, normalizedSearch, kycStatus, excludeKycStatus, status, joinedFromInstant, joinedToExclusive,
            newestFirst, PageRequest.of(page, size));

        List<AdminAssociateSummaryResponse> summaries = toSummaries(result.getContent());
        return new AdminAssociatePageResponse(summaries, page, size, result.getTotalElements());
    }

    public AdminAssociateDetailResponse get(UUID id) {
        return toDetail(findOrThrow(id));
    }

    @Transactional
    public AssociateProfileResponse updateProfile(UUID id, AdminUpdateAssociateProfileRequest r, UUID actorId) {
        Associate a = findOrThrow(id);
        if (r.phone() != null && !r.phone().equals(a.getPhone()) && associateRepository.existsByPhone(r.phone())) {
            throw new PhoneAlreadyRegisteredException(r.phone());
        }
        a.setName(r.name());
        a.setPhone(r.phone());
        a.setEmail(r.email());
        a.setAddress(r.address());
        a.setFatherHusbandName(r.fatherHusbandName());
        a.setDateOfBirth(r.dateOfBirth());
        a.setGender(r.gender());
        a.setMaritalStatus(r.maritalStatus());
        a.setState(r.state());
        a.setDistrict(r.district());
        a.setPostalCode(r.postalCode());
        associateRepository.save(a);
        audit(a, "profile", actorId);
        return AssociateProfileResponse.from(a);
    }

    @Transactional
    public AssociateBankDetailsResponse updateBankDetails(UUID id, UpdateAssociateBankDetailsRequest r, UUID actorId) {
        AssociateBankDetailsResponse res = bankDetailsService.updateBankDetails(id, r);
        audit(findOrThrow(id), "bank details", actorId);
        return res;
    }

    @Transactional
    public AssociateNomineeResponse updateNominee(UUID id, AdminUpdateAssociateNomineeRequest r, UUID actorId) {
        AssociateNomineeResponse res = nomineeService.updateNominee(id, r);
        audit(findOrThrow(id), "nominee", actorId);
        return res;
    }

    private void audit(Associate a, String what, UUID actorId) {
        settingsAuditService.record("ASSOCIATE", "Edited " + what + " of " + a.getUserId(),
            Map.of("associateId", a.getId().toString()), actorId);
    }

    @Transactional
    public AdminAssociateDetailResponse suspend(UUID id, UUID actorId) {
        Associate associate = findOrThrow(id);
        associate.setStatus(AssociateStatus.SUSPENDED);
        associateRepository.save(associate);
        evictStatusCacheAfterCommit(id);
        settingsAuditService.record("ASSOCIATE", "Suspended " + associate.getUserId(),
            Map.of("associateId", id.toString()), actorId);
        return toDetail(associate);
    }

    @Transactional
    public AdminAssociateDetailResponse reactivate(UUID id, UUID actorId) {
        Associate associate = findOrThrow(id);
        // Known gap (epin-blog-extension spec, Review Focus 7): reactivating a suspended
        // associate who was PENDING sets ACTIVE and skips the activation e-PIN. Out of scope.
        associate.setStatus(AssociateStatus.ACTIVE);
        associateRepository.save(associate);
        evictStatusCacheAfterCommit(id);
        settingsAuditService.record("ASSOCIATE", "Reactivated " + associate.getUserId(),
            Map.of("associateId", id.toString()), actorId);
        return toDetail(associate);
    }

    @Transactional
    public ResetPasswordResponse resetPassword(UUID id, UUID actorId) {
        Associate associate = findOrThrow(id);
        String temporaryPassword = TemporaryPasswordGenerator.generate();
        associate.setPasswordHash(passwordEncoder.encode(temporaryPassword));
        associate.setLoginPasswordPlain(temporaryPassword);
        associate.setMustChangePassword(true);
        associateRepository.save(associate);
        settingsAuditService.record("ASSOCIATE", "Reset password for " + associate.getUserId(),
            Map.of("associateId", id.toString()), actorId);
        return new ResetPasswordResponse(temporaryPassword);
    }

    @Transactional
    public ResetPasswordResponse resetTransactionPassword(UUID id, UUID actorId) {
        Associate associate = findOrThrow(id);
        String transactionPassword = TemporaryPasswordGenerator.generate();
        associate.setTransactionPasswordHash(passwordEncoder.encode(transactionPassword));
        associate.setTransactionPasswordPlain(transactionPassword);
        associate.setTransactionPasswordFailedAttempts(0);
        associate.setTransactionPasswordLockedUntil(null);
        associateRepository.save(associate);
        settingsAuditService.record("ASSOCIATE", "Reset transaction password for " + associate.getUserId(),
            Map.of("associateId", id.toString()), actorId);
        return new ResetPasswordResponse(transactionPassword);
    }

    private void evictStatusCacheAfterCommit(UUID associateId) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    associateStatusCache.evict(associateId);
                }
            });
        } else {
            associateStatusCache.evict(associateId);
        }
    }

    private Associate findOrThrow(UUID id) {
        return associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)
            .orElseThrow(() -> new AssociateNotFoundException(id));
    }

    // Sponsor userIds and designations resolved in one query each for the whole page (toDetail's
    // per-row lookups would be N+1 here).
    private List<AdminAssociateSummaryResponse> toSummaries(List<Associate> page) {
        Set<UUID> sponsorIds = page.stream().map(Associate::getSponsorId).filter(Objects::nonNull)
            .collect(Collectors.toSet());
        Map<UUID, String> sponsorUserIds = associateRepository.findAllById(sponsorIds).stream()
            .collect(Collectors.toMap(Associate::getId, Associate::getUserId));
        Map<UUID, String> designations = designationService.designationsOf(page.stream().map(Associate::getId).toList());
        return page.stream().map(a -> toSummary(a, designations.get(a.getId()), sponsorUserIds.get(a.getSponsorId()))).toList();
    }

    private AdminAssociateSummaryResponse toSummary(Associate a, String designation, String sponsorUserId) {
        return new AdminAssociateSummaryResponse(
            a.getId(), a.getUserId(), a.getName(), designation,
            a.getKycStatus(), a.getStatus(), a.getJoinedAt(), a.getLastActiveAt(), sponsorUserId,
            a.getPosition(), a.getRole(), a.getLoginPasswordPlain(), a.getTransactionPasswordPlain());
    }

    private AdminAssociateDetailResponse toDetail(Associate a) {
        Associate sponsor = a.getSponsorId() == null ? null : associateRepository.findById(a.getSponsorId()).orElse(null);
        Associate parent = a.getParentId() == null ? null : associateRepository.findById(a.getParentId()).orElse(null);

        // Same fix as DashboardService/TreeExplorerService: leg_volume rows are written only at
        // cycle CLOSE, so reading the OPEN cycle here was a structural no-op that always fell
        // through to zero. See docs/superpowers/plans/2026-08-18-dashboard-leg-volume-fixes.md.
        Optional<Cycle> latestClosedCycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED);
        BigDecimal leftLegVolume = BigDecimal.ZERO;
        BigDecimal rightLegVolume = BigDecimal.ZERO;
        if (latestClosedCycle.isPresent()) {
            Optional<LegVolume> legVolume =
                legVolumeRepository.findByAssociateIdAndCycleId(a.getId(), latestClosedCycle.get().getId());
            leftLegVolume = legVolume.map(LegVolume::getLeftLegVolume).orElse(BigDecimal.ZERO);
            rightLegVolume = legVolume.map(LegVolume::getRightLegVolume).orElse(BigDecimal.ZERO);
        }

        return new AdminAssociateDetailResponse(
            a.getId(), a.getUserId(), a.getName(), a.getEmail(), a.getPhone(),
            designationService.designationOf(a.getId()), a.getKycStatus(), a.getStatus(),
            a.getJoinedAt(), a.getLastActiveAt(),
            a.getSponsorId(), sponsor == null ? null : sponsor.getUserId(),
            a.getParentId(), parent == null ? null : parent.getUserId(), a.getPosition(),
            associateRepository.countByParentId(a.getId()), associateRepository.countDownline(a.getId()),
            leftLegVolume, rightLegVolume,
            a.getLoginPasswordPlain(), a.getTransactionPasswordPlain());
    }
}
