package com.plotchain.associate;

import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

@Service
public class AssociateProvisioningService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final AssociateRepository associateRepository;
    private final RankTierRepository rankTierRepository;
    private final PasswordEncoder passwordEncoder;
    private final String associateIdPrefix;

    public AssociateProvisioningService(
        AssociateRepository associateRepository,
        RankTierRepository rankTierRepository,
        PasswordEncoder passwordEncoder,
        @Value("${plotchain.associate-id-prefix:VP}") String associateIdPrefix
    ) {
        this.associateRepository = associateRepository;
        this.rankTierRepository = rankTierRepository;
        this.passwordEncoder = passwordEncoder;
        this.associateIdPrefix = associateIdPrefix;
    }

    public CreateAssociateResponse create(CreateAssociateRequest request) {
        if (associateRepository.existsByEmail(request.email())) {
            throw new EmailAlreadyRegisteredException(request.email());
        }

        if (request.parentId() != null) {
            associateRepository.findById(request.parentId())
                .orElseThrow(() -> new AssociateNotFoundException(request.parentId()));
            if (request.position() != null
                && associateRepository.existsByParentIdAndPosition(request.parentId(), request.position())) {
                throw new PlacementUnavailableException(request.parentId(), request.position());
            }
        }

        RankTier lowestRank = rankTierRepository.findAllByOrderByRankOrder().stream()
            .findFirst()
            .orElseThrow(NoRankTiersConfiguredException::new);

        String temporaryPassword = generateTemporaryPassword();
        String userId = generateAssociateId();

        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setUserId(userId);
        associate.setName(request.name());
        associate.setEmail(request.email());
        associate.setPasswordHash(passwordEncoder.encode(temporaryPassword));
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setSponsorId(request.sponsorId());
        associate.setParentId(request.parentId());
        associate.setPosition(request.position());
        associate.setRankId(lowestRank.getId());
        associate.setKycStatus(KycStatus.PENDING);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setMustChangePassword(true);
        associateRepository.save(associate);

        return new CreateAssociateResponse(associate.getId(), userId, temporaryPassword);
    }

    // Generates a fixed-width, zero-padded ID (e.g. VP00001, VP00002, ...) so that string
    // ordering matches numeric ordering, letting findTopByUserIdStartingWithOrderByUserIdDesc
    // work without native SQL. Re-checks existsByUserId defensively before returning: two
    // concurrent provisioning calls could otherwise compute the same next number.
    private String generateAssociateId() {
        int next = associateRepository.findTopByUserIdStartingWithOrderByUserIdDesc(associateIdPrefix)
            .map(Associate::getUserId)
            .map(existingId -> {
                try {
                    return Integer.parseInt(existingId.substring(associateIdPrefix.length())) + 1;
                } catch (NumberFormatException e) {
                    return 1;
                }
            })
            .orElse(1);

        String candidate;
        do {
            candidate = String.format("%s%05d", associateIdPrefix, next);
            next++;
        } while (associateRepository.existsByUserId(candidate));
        return candidate;
    }

    private static String generateTemporaryPassword() {
        byte[] bytes = new byte[12];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
