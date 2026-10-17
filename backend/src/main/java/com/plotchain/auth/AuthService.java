package com.plotchain.auth;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatus;
import com.plotchain.company.SettingsAuditService;
import com.plotchain.company.SetupStateService;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
public class AuthService {

    private final AssociateRepository associateRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final SetupStateService setupStateService;
    private final SettingsAuditService settingsAuditService;

    public AuthService(
        AssociateRepository associateRepository,
        PasswordEncoder passwordEncoder,
        JwtService jwtService,
        SetupStateService setupStateService,
        SettingsAuditService settingsAuditService
    ) {
        this.settingsAuditService = settingsAuditService;
        this.associateRepository = associateRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.setupStateService = setupStateService;
    }

    public LoginResponse login(LoginRequest request) {
        Associate associate = associateRepository.findByUserId(request.userId())
            .orElseThrow(InvalidCredentialsException::new);

        if (!passwordEncoder.matches(request.password(), associate.getPasswordHash())) {
            throw new InvalidCredentialsException();
        }

        if (associate.getStatus() == AssociateStatus.SUSPENDED) {
            throw new AssociateSuspendedException();
        }

        associate.setLastActiveAt(Instant.now());
        associateRepository.save(associate);

        // Setup mode: associate-role logins are rejected until the founding admin goes live.
        // Admin-family roles are exempt so the wizard itself stays reachable.
        if (associate.getRole() == AssociateRole.ASSOCIATE && !setupStateService.isLaunched()) {
            throw new PlatformNotLiveException();
        }

        String token = jwtService.generateToken(associate);
        return new LoginResponse(token, associate.getId(), associate.getRole().name(), associate.isMustChangePassword());
    }

    @Transactional
    public LoginResponse impersonate(UUID targetId, UUID adminId) {
        Associate target = associateRepository.findById(targetId)
            .orElseThrow(() -> new AssociateNotFoundException(targetId));
        if (target.getRole() != AssociateRole.ASSOCIATE) {
            throw new ImpersonationNotAllowedException();
        }
        if (target.getStatus() == AssociateStatus.SUSPENDED) {
            throw new AssociateSuspendedException();
        }
        if (!setupStateService.isLaunched()) {
            throw new PlatformNotLiveException();
        }
        String token = jwtService.generateImpersonationToken(target, adminId);
        settingsAuditService.record("IMPERSONATION", "Logged in as " + target.getUserId(),
            Map.of("associateId", target.getId().toString()), adminId);
        return new LoginResponse(token, target.getId(), "ASSOCIATE", false);
    }

    public void changePassword(UUID associateId, ChangePasswordRequest request) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));

        if (!passwordEncoder.matches(request.currentPassword(), associate.getPasswordHash())) {
            throw new InvalidCredentialsException();
        }

        associate.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        associate.setMustChangePassword(false);
        associateRepository.save(associate);
    }
}
