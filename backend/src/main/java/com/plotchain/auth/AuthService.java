package com.plotchain.auth;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.company.SetupStateService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

@Service
public class AuthService {

    private final AssociateRepository associateRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final SetupStateService setupStateService;

    public AuthService(
        AssociateRepository associateRepository,
        PasswordEncoder passwordEncoder,
        JwtService jwtService,
        SetupStateService setupStateService
    ) {
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

        associate.setLastActiveAt(Instant.now());
        associateRepository.save(associate);

        // Setup mode: associate-role logins are rejected until the founding admin goes live.
        // Admin-family roles are exempt so the wizard itself stays reachable.
        if (!associate.getRole().isAdminFamily() && !setupStateService.isLaunched()) {
            throw new PlatformNotLiveException();
        }

        String token = jwtService.generateToken(associate);
        return new LoginResponse(token, associate.getId(), associate.getRole().name(), associate.isMustChangePassword());
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
