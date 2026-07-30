package com.plotchain.company;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateIdGenerator;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.associate.NoRankTiersConfiguredException;
import com.plotchain.associate.TemporaryPasswordGenerator;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

// Root associates are Associate rows seeded at the top of the binary tree: parentId, sponsorId,
// and position all stay null. Both possible roots (left and any optional right) share that same
// null shape, so which is which is never persisted -- see findRoots()'s ordering.
@Service
public class RootAssociateProvisioningService {

    private final AssociateRepository associateRepository;
    private final RankTierRepository rankTierRepository;
    private final PasswordEncoder passwordEncoder;
    private final AssociateIdGenerator associateIdGenerator;

    public RootAssociateProvisioningService(
        AssociateRepository associateRepository,
        RankTierRepository rankTierRepository,
        PasswordEncoder passwordEncoder,
        AssociateIdGenerator associateIdGenerator
    ) {
        this.associateRepository = associateRepository;
        this.rankTierRepository = rankTierRepository;
        this.passwordEncoder = passwordEncoder;
        this.associateIdGenerator = associateIdGenerator;
    }

    public CreateRootAssociateResponse create(CreateRootAssociateRequest request) {
        if (!findRoots().isEmpty()) {
            throw new RootAssociateAlreadyExistsException();
        }
        if (request.seedRightRoot() && (isBlank(request.rightName()) || isBlank(request.rightPhone()))) {
            throw new RightRootDetailsRequiredException();
        }

        RankTier lowestRank = rankTierRepository.findAllByOrderByRankOrder().stream()
            .findFirst()
            .orElseThrow(NoRankTiersConfiguredException::new);

        RootAssociateCreationResult left = createRoot(request.name(), request.phone(), "LEFT", lowestRank.getId());
        RootAssociateCreationResult right = request.seedRightRoot()
            ? createRoot(request.rightName(), request.rightPhone(), "RIGHT", lowestRank.getId())
            : null;

        return new CreateRootAssociateResponse(left, right);
    }

    public RootAssociateSlotsResponse list() {
        List<Associate> roots = findRoots();
        List<RootAssociateSummaryResponse> summaries = roots.stream()
            .map(a -> new RootAssociateSummaryResponse(a.getId(), a.getUserId(), a.getName(), a.getPhone(), slotLabelFor(roots, a)))
            .toList();
        return new RootAssociateSlotsResponse(summaries, !roots.isEmpty(), roots.size() > 1);
    }

    // Step 7 is complete once at least one root exists -- the founding admin can seed just the
    // left root and finish this step; the optional right root doesn't gate completeness.
    public boolean isComplete() {
        return !findRoots().isEmpty();
    }

    private RootAssociateCreationResult createRoot(String name, String phone, String slotLabel, UUID rankId) {
        String temporaryPassword = TemporaryPasswordGenerator.generate();
        String userId = associateIdGenerator.generate();

        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setUserId(userId);
        associate.setName(name);
        associate.setPhone(phone);
        associate.setEmail(null);
        associate.setPasswordHash(passwordEncoder.encode(temporaryPassword));
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setSponsorId(null);
        associate.setParentId(null);
        associate.setPosition(null);
        associate.setRankId(rankId);
        associate.setKycStatus(KycStatus.PENDING);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setMustChangePassword(true);
        associateRepository.save(associate);

        return new RootAssociateCreationResult(associate.getId(), userId, temporaryPassword, name, slotLabel);
    }

    private List<Associate> findRoots() {
        return associateRepository.findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc(AssociateRole.ASSOCIATE);
    }

    private String slotLabelFor(List<Associate> roots, Associate associate) {
        return roots.indexOf(associate) == 0 ? "LEFT" : "RIGHT";
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
