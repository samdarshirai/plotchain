package com.plotchain.associate;

import com.plotchain.epin.EPinDuplicateIdentityException;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Service
public class AssociateProvisioningService {

    private final AssociateRepository associateRepository;
    private final RankTierRepository rankTierRepository;
    private final PasswordEncoder passwordEncoder;
    private final AssociateIdGenerator associateIdGenerator;
    private final AssociateNomineeRepository nomineeRepository;

    public AssociateProvisioningService(
        AssociateRepository associateRepository,
        RankTierRepository rankTierRepository,
        PasswordEncoder passwordEncoder,
        AssociateIdGenerator associateIdGenerator,
        AssociateNomineeRepository nomineeRepository
    ) {
        this.associateRepository = associateRepository;
        this.rankTierRepository = rankTierRepository;
        this.passwordEncoder = passwordEncoder;
        this.associateIdGenerator = associateIdGenerator;
        this.nomineeRepository = nomineeRepository;
    }

    @Transactional
    public CreateAssociateResponse create(CreateAssociateRequest request) {
        assertIdentityUnique(request);
        UUID sponsorId = null;
        UUID parentId = null;
        if (request.sponsorUserId() != null && !request.sponsorUserId().isBlank()) {
            Associate sponsor = associateRepository.findByUserId(request.sponsorUserId().trim())
                .orElseThrow(() -> new AssociateNotFoundException(request.sponsorUserId()));
            if (request.position() == null) {
                throw new PositionRequiredException(sponsor.getId());
            }
            sponsorId = sponsor.getId();
            parentId = findFreeSlotParent(sponsor, request.position()).getId();
        }
        String email = request.email() == null || request.email().isBlank() ? null : request.email().trim();
        Associate associate = createPending(request.name().trim(), email, request.phone(),
            sponsorId, parentId, parentId == null ? null : request.position());
        applyProfile(associate, request);
        String transactionPassword = assignGeneratedTransactionPassword(associate);
        associateRepository.save(associate);
        saveNominee(associate.getId(), request.nomineeName(), request.nomineeRelation());
        return new CreateAssociateResponse(associate.getId(), associate.getUserId(),
            associate.getTemporaryPassword(), transactionPassword);
    }

    /** PAN / Aadhaar must each be unused; surfaced as 409 with code PAN_TAKEN etc. */
    public void assertIdentityUnique(AssociateProfileFields f) {
        if (associateRepository.existsByPanNumber(f.panNumber())) {
            throw new EPinDuplicateIdentityException("PAN_TAKEN");
        }
        if (associateRepository.existsByAadhaarNumber(f.aadhaarNumber())) {
            throw new EPinDuplicateIdentityException("AADHAAR_TAKEN");
        }
    }

    /** Walks down the sponsor's chosen leg to its first free slot and returns the node to hang under. */
    // ponytail: O(leg depth) lookups; the unique (parent, position) index is the race guard.
    public Associate findFreeSlotParent(Associate sponsor, String position) {
        Associate parent = sponsor;
        for (Associate next = associateRepository.findFirstByParentIdAndPosition(parent.getId(), position).orElse(null);
             next != null;
             next = associateRepository.findFirstByParentIdAndPosition(parent.getId(), position).orElse(null)) {
            parent = next;
        }
        return parent;
    }

    public void applyProfile(Associate member, AssociateProfileFields f) {
        member.setFatherHusbandName(f.fatherHusbandName());
        member.setPanNumber(f.panNumber());
        member.setAadhaarNumber(f.aadhaarNumber());
        member.setDateOfBirth(f.dateOfBirth());
        member.setGender(f.gender());
        member.setMaritalStatus(f.maritalStatus());
        member.setState(f.state());
        member.setDistrict(f.district());
        member.setAddress(f.address());
        member.setPostalCode(f.postalCode());
    }

    private void saveNominee(UUID associateId, String nomineeName, String nomineeRelation) {
        if (nomineeName == null || nomineeName.isBlank()) {
            return;
        }
        AssociateNominee nominee = new AssociateNominee();
        nominee.setId(UUID.randomUUID());
        nominee.setAssociateId(associateId);
        nominee.setNomineeName(nomineeName.trim());
        nominee.setRelation(nomineeRelation);
        nominee.setUpdatedAt(Instant.now());
        nomineeRepository.save(nominee);
    }

    // Shared by admin create and the associate e-Pin Join: validates placement, then saves
    // a PENDING associate. The caller may set extra profile fields on the returned entity and save
    // again in the same transaction. The one-time temporary password rides on a transient field.
    public Associate createPending(String name, String email, String phone, UUID sponsorId, UUID parentId, String position) {
        if (parentId != null) {
            associateRepository.findById(parentId)
                .orElseThrow(() -> new AssociateNotFoundException(parentId));
            // A parent with no position would be invisible to any per-leg associate count
            // (filtered on position = 'L'/'R') while still being counted in totalDownline and
            // credited to a leg by CycleService's matching-income rollup ("R".equals(position) ?
            // right : left treats null as left) -- silently correct for volume, silently wrong
            // for a leg headcount shown on screen.
            if (position == null) {
                throw new PositionRequiredException(parentId);
            }
            if (associateRepository.existsByParentIdAndPosition(parentId, position)) {
                throw new PlacementUnavailableException(parentId, position);
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
        associate.setName(name);
        associate.setEmail(email);
        associate.setPhone(phone);
        associate.setPasswordHash(passwordEncoder.encode(temporaryPassword));
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setStatus(AssociateStatus.PENDING);
        associate.setSponsorId(sponsorId);
        associate.setParentId(parentId);
        associate.setPosition(position);
        associate.setRankId(lowestRank.getId());
        associate.setKycStatus(KycStatus.PENDING);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setMustChangePassword(true);
        associate.setTemporaryPassword(temporaryPassword);
        associateRepository.save(associate);
        return associate;
    }

    /** Generates a one-time transaction password, stores only its hash, and returns the plaintext. */
    public String assignGeneratedTransactionPassword(Associate associate) {
        String plain = TemporaryPasswordGenerator.generate();
        associate.setTransactionPasswordHash(passwordEncoder.encode(plain));
        return plain;
    }
}
