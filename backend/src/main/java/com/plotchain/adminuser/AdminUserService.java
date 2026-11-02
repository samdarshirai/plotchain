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
import java.util.Set;
import java.util.UUID;

/**
 * Back-office users: associate rows with role ADMIN or MANAGER. ADMIN sees and manages both;
 * MANAGER sees and manages MANAGER rows only -- ADMIN rows answer 404 to a manager.
 */
@Service
public class AdminUserService {

    static final UUID SEED_ADMIN_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

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
    public List<AdminUserResponse> list(AssociateRole actorRole) {
        return repository.findByRoleInOrderByUserIdAsc(visibleRoles(actorRole)).stream().map(AdminUserResponse::of).toList();
    }

    @Transactional
    public AdminUserResponse create(AdminUserRequest request, UUID actorId, AssociateRole actorRole) {
        AssociateRole role = request.role() == null ? actorRole : request.role();
        if (!visibleRoles(actorRole).contains(role)) {
            throw new AdminUserException(HttpStatus.FORBIDDEN, "You cannot create users with role " + role);
        }
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
        admin.setRole(role);
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
        auditService.record(auditSection(admin), "Created " + label(admin) + " " + userId, Map.of("id", admin.getId().toString()), actorId);
        return AdminUserResponse.of(admin, temporaryPassword);
    }

    @Transactional
    public AdminUserResponse update(UUID id, AdminUserRequest request, UUID actorId, AssociateRole actorRole) {
        Associate admin = findOrThrow(id, actorRole);
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
        auditService.record(auditSection(admin), "Updated " + label(admin) + " " + admin.getUserId(), Map.of("id", id.toString()), actorId);
        return AdminUserResponse.of(admin);
    }

    @Transactional
    public void delete(UUID id, UUID actorId, AssociateRole actorRole) {
        Associate admin = findOrThrow(id, actorRole);
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
                "User has linked records and cannot be deleted; suspend instead");
        }
        statusCache.evict(id);
        auditService.record(auditSection(admin), "Deleted " + label(admin) + " " + admin.getUserId(), Map.of("deleted", id.toString()), actorId);
    }

    @Transactional
    public AdminUserResponse resetPassword(UUID id, UUID actorId, AssociateRole actorRole) {
        Associate admin = findOrThrow(id, actorRole);
        String temporaryPassword = TemporaryPasswordGenerator.generate();
        admin.setPasswordHash(passwordEncoder.encode(temporaryPassword));
        admin.setMustChangePassword(true);
        repository.save(admin);
        auditService.record(auditSection(admin), "Reset password for " + label(admin) + " " + admin.getUserId(), Map.of("id", id.toString()), actorId);
        return AdminUserResponse.of(admin, temporaryPassword);
    }

    private Associate findOrThrow(UUID id, AssociateRole actorRole) {
        return repository.findById(id)
            .filter(a -> visibleRoles(actorRole).contains(a.getRole()))
            .orElseThrow(() -> new AdminUserException(HttpStatus.NOT_FOUND, "User not found: " + id));
    }

    static Set<AssociateRole> visibleRoles(AssociateRole actorRole) {
        return switch (actorRole) {
            case ADMIN -> Set.of(AssociateRole.ADMIN, AssociateRole.MANAGER);
            case MANAGER -> Set.of(AssociateRole.MANAGER);
            default -> Set.of();
        };
    }

    // MANAGER_USERS is visible to managers in the audit log; ADMIN_USERS is not.
    private static String auditSection(Associate user) {
        return user.getRole() == AssociateRole.MANAGER ? "MANAGER_USERS" : "ADMIN_USERS";
    }

    private static String label(Associate user) {
        return user.getRole() == AssociateRole.MANAGER ? "manager" : "admin user";
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
