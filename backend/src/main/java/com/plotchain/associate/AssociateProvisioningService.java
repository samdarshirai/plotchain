package com.plotchain.associate;

import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Service
public class AssociateProvisioningService {

    private final AssociateRepository associateRepository;
    private final RankTierRepository rankTierRepository;
    private final PasswordEncoder passwordEncoder;
    private final AssociateIdGenerator associateIdGenerator;

    public AssociateProvisioningService(
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

    public CreateAssociateResponse create(CreateAssociateRequest request) {
        Associate associate = createPending(request.name(), request.email(), request.phone(),
            request.sponsorId(), request.parentId(), request.position());
        return new CreateAssociateResponse(associate.getId(), associate.getUserId(), associate.getTemporaryPassword());
    }

    // Shared by admin create and the associate e-Pin Join: validates email + placement, then saves
    // a PENDING associate. The caller may set extra profile fields on the returned entity and save
    // again in the same transaction. The one-time temporary password rides on a transient field.
    public Associate createPending(String name, String email, String phone, UUID sponsorId, UUID parentId, String position) {
        if (email != null && associateRepository.existsByEmail(email)) {
            throw new EmailAlreadyRegisteredException(email);
        }
        CreateAssociateRequest request = new CreateAssociateRequest(name, email, sponsorId, parentId, position, phone);

        if (request.parentId() != null) {
            associateRepository.findById(request.parentId())
                .orElseThrow(() -> new AssociateNotFoundException(request.parentId()));
            // A parent with no position would be invisible to any per-leg associate count
            // (filtered on position = 'L'/'R') while still being counted in totalDownline and
            // credited to a leg by CycleService's matching-income rollup ("R".equals(position) ?
            // right : left treats null as left) -- silently correct for volume, silently wrong
            // for a leg headcount shown on screen.
            if (request.position() == null) {
                throw new PositionRequiredException(request.parentId());
            }
            if (associateRepository.existsByParentIdAndPosition(request.parentId(), request.position())) {
                throw new PlacementUnavailableException(request.parentId(), request.position());
            }
        }

        RankTier lowestRank = rankTierRepository.findAllByOrderByRankOrder().stream()
            .findFirst()
            .orElseThrow(NoRankTiersConfiguredException::new);

        String temporaryPassword = TemporaryPasswordGenerator.generate();
        String userId = associateIdGenerator.generate();

        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setUserId(userId);
        associate.setName(request.name());
        associate.setEmail(request.email());
        associate.setPhone(request.phone());
        associate.setPasswordHash(passwordEncoder.encode(temporaryPassword));
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setStatus(AssociateStatus.PENDING);
        associate.setSponsorId(request.sponsorId());
        associate.setParentId(request.parentId());
        associate.setPosition(request.position());
        associate.setRankId(lowestRank.getId());
        associate.setKycStatus(KycStatus.PENDING);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setMustChangePassword(true);
        associate.setTemporaryPassword(temporaryPassword);
        associateRepository.save(associate);
        return associate;
    }
}
