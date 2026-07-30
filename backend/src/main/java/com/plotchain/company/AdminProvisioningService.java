package com.plotchain.company;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.associate.TemporaryPasswordGenerator;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

// Deliberately separate from AssociateProvisioningService: different role set, different
// defaults, no sponsor/parent/rank tree logic, no email requirement. Overloading one service
// with two unrelated creation flows would blur both.
@Service
public class AdminProvisioningService {

    private final AssociateRepository associateRepository;
    private final PasswordEncoder passwordEncoder;

    public AdminProvisioningService(AssociateRepository associateRepository, PasswordEncoder passwordEncoder) {
        this.associateRepository = associateRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public CreateAdminResponse create(CreateAdminRequest request) {
        AssociateRole role = parseAssignableRole(request.role());

        if (associateRepository.existsByUserId(request.userId())) {
            throw new UserIdAlreadyRegisteredException(request.userId());
        }

        String temporaryPassword = request.temporaryPassword() == null || request.temporaryPassword().isBlank()
            ? TemporaryPasswordGenerator.generate()
            : request.temporaryPassword();

        Associate admin = new Associate();
        admin.setId(UUID.randomUUID());
        admin.setUserId(request.userId());
        admin.setName(request.fullName());
        admin.setEmail(null);
        admin.setPasswordHash(passwordEncoder.encode(temporaryPassword));
        admin.setRole(role);
        admin.setRankId(null);
        admin.setKycStatus(KycStatus.VERIFIED);
        admin.setJoinedAt(Instant.now());
        admin.setCumulativeMatchedVolume(BigDecimal.ZERO);
        admin.setMustChangePassword(true);
        associateRepository.save(admin);

        return new CreateAdminResponse(admin.getId(), request.userId(), role.name(), temporaryPassword);
    }

    public List<AdminSummaryResponse> list() {
        return associateRepository.findByRoleNotOrderByUserIdAsc(AssociateRole.ASSOCIATE).stream()
            .map(a -> new AdminSummaryResponse(a.getId(), a.getUserId(), a.getName(), a.getRole().name(), a.getLastActiveAt()))
            .toList();
    }

    public boolean isUserIdAvailable(String userId) {
        return !associateRepository.existsByUserId(userId);
    }

    // Step 6 is complete once at least one admin-family account exists beyond the founding
    // admin AdminBootstrapRunner creates -- matching the spec's "optional... but strongly
    // prompted" framing rather than being satisfied by the founding account alone.
    //
    // countByRoleNot(ASSOCIATE) is used instead of a findAll().stream().filter(isAdminFamily())
    // scan: associate is this platform's unbounded-growth table (an MLM binary tree), and this
    // method runs on every setup-state read. Every non-ASSOCIATE AssociateRole value happens to
    // satisfy isAdminFamily() today (isAdminFamily() is defined as "!= ASSOCIATE"), so counting
    // rows where role != ASSOCIATE is equivalent to counting admin-family rows -- but a future
    // role added to the enum without updating isAdminFamily() accordingly would break that
    // equivalence, so keep the two definitions in sync.
    public boolean isComplete() {
        return associateRepository.countByRoleNot(AssociateRole.ASSOCIATE) > 1;
    }

    // ASSOCIATE is rejected because it isn't an admin-family role at all; ADMIN is rejected
    // because plain ADMIN is reserved for AdminBootstrapRunner's founding account and is never
    // created through this UI, whose Role select only lists the other four roles.
    private AssociateRole parseAssignableRole(String role) {
        AssociateRole parsed;
        try {
            parsed = AssociateRole.valueOf(role);
        } catch (IllegalArgumentException e) {
            throw new InvalidAdminRoleException(role);
        }
        if (parsed == AssociateRole.ASSOCIATE || parsed == AssociateRole.ADMIN) {
            throw new InvalidAdminRoleException(role);
        }
        return parsed;
    }
}
