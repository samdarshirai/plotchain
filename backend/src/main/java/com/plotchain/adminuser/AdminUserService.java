package com.plotchain.adminuser;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatus;
import com.plotchain.associate.AssociateStatusCache;
import com.plotchain.associate.KycStatus;
import com.plotchain.associate.TemporaryPasswordGenerator;
import com.plotchain.company.SettingsAuditService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Team admins: associate rows with role=ADMIN. Listing/mutation is scoped to that role only. */
@Service
public class AdminUserService {

    static final UUID SEED_ADMIN_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final String AUDIT_SECTION = "ADMIN_USERS";

    private final AssociateRepository repository;
    private final PasswordEncoder passwordEncoder;
    private final SettingsAuditService auditService;
    private final AssociateStatusCache statusCache;

    public AdminUserService(AssociateRepository repository, PasswordEncoder passwordEncoder,
                            SettingsAuditService auditService, AssociateStatusCache statusCache) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
        this.auditService = auditService;
        this.statusCache = statusCache;
    }

    @Transactional(readOnly = true)
    public List<AdminUserResponse> list() {
        return repository.findByRoleOrderByUserIdAsc(AssociateRole.ADMIN).stream().map(AdminUserResponse::of).toList();
    }

    @Transactional
    public AdminUserResponse create(AdminUserRequest request, UUID actorId) {
        String userId = request.userId().trim();
        String email = blankToNull(request.email());
        if (repository.existsByUserId(userId)) {
            throw new AdminUserException(HttpStatus.CONFLICT, "User ID already in use: " + userId);
        }
        if (email != null && repository.existsByEmail(email)) {
            throw new AdminUserException(HttpStatus.CONFLICT, "Email already registered: " + email);
        }
        String temporaryPassword = TemporaryPasswordGenerator.generate();
        Associate admin = new Associate();
        admin.setId(UUID.randomUUID());
        admin.setRole(AssociateRole.ADMIN);
        admin.setUserId(userId);
        admin.setName(request.name().trim());
        admin.setPhone(request.phone().trim());
        admin.setEmail(email);
        admin.setStatus(request.status() == null ? AssociateStatus.ACTIVE : activeOrSuspended(request.status()));
        admin.setKycStatus(KycStatus.VERIFIED);
        admin.setJoinedAt(Instant.now());
        admin.setCumulativeMatchedVolume(BigDecimal.ZERO);
        admin.setPasswordHash(passwordEncoder.encode(temporaryPassword));
        admin.setMustChangePassword(true);
        repository.save(admin);
        auditService.record(AUDIT_SECTION, "Created admin user " + userId, Map.of("id", admin.getId().toString()), actorId);
        return AdminUserResponse.of(admin, temporaryPassword);
    }

    @Transactional
    public AdminUserResponse update(UUID id, AdminUserRequest request, UUID actorId) {
        Associate admin = findOrThrow(id);
        String email = blankToNull(request.email());
        if (email != null && !email.equalsIgnoreCase(admin.getEmail()) && repository.existsByEmail(email)) {
            throw new AdminUserException(HttpStatus.CONFLICT, "Email already registered: " + email);
        }
        AssociateStatus status = request.status() == null ? admin.getStatus() : activeOrSuspended(request.status());
        if (status == AssociateStatus.SUSPENDED && id.equals(actorId)) {
            throw new AdminUserException(HttpStatus.CONFLICT, "You cannot suspend your own account");
        }
        admin.setName(request.name().trim());
        admin.setPhone(request.phone().trim());
        admin.setEmail(email);
        admin.setStatus(status);
        repository.save(admin);
        statusCache.evict(id);
        auditService.record(AUDIT_SECTION, "Updated admin user " + admin.getUserId(), Map.of("id", id.toString()), actorId);
        return AdminUserResponse.of(admin);
    }

    @Transactional
    public void delete(UUID id, UUID actorId) {
        Associate admin = findOrThrow(id);
        if (id.equals(actorId)) {
            throw new AdminUserException(HttpStatus.CONFLICT, "You cannot delete your own account");
        }
        if (SEED_ADMIN_ID.equals(id)) {
            throw new AdminUserException(HttpStatus.CONFLICT, "The default admin cannot be deleted");
        }
        try {
            repository.delete(admin);
            repository.flush();
        } catch (DataIntegrityViolationException e) {
            throw new AdminUserException(HttpStatus.CONFLICT,
                "Admin user has linked records and cannot be deleted; suspend instead");
        }
        statusCache.evict(id);
        auditService.record(AUDIT_SECTION, "Deleted admin user " + admin.getUserId(), Map.of("deleted", id.toString()), actorId);
    }

    @Transactional
    public AdminUserResponse resetPassword(UUID id, UUID actorId) {
        Associate admin = findOrThrow(id);
        String temporaryPassword = TemporaryPasswordGenerator.generate();
        admin.setPasswordHash(passwordEncoder.encode(temporaryPassword));
        admin.setMustChangePassword(true);
        repository.save(admin);
        auditService.record(AUDIT_SECTION, "Reset password for admin user " + admin.getUserId(), Map.of("id", id.toString()), actorId);
        return AdminUserResponse.of(admin, temporaryPassword);
    }

    private Associate findOrThrow(UUID id) {
        return repository.findByIdAndRole(id, AssociateRole.ADMIN)
            .orElseThrow(() -> new AdminUserException(HttpStatus.NOT_FOUND, "Admin user not found: " + id));
    }

    private static AssociateStatus activeOrSuspended(AssociateStatus s) {
        if (s == AssociateStatus.PENDING) {
            throw new AdminUserException(HttpStatus.BAD_REQUEST, "Status must be ACTIVE or SUSPENDED");
        }
        return s;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
