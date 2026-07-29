package com.plotchain.auth;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class AuthService {

    private final AssociateRepository associateRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(AssociateRepository associateRepository, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.associateRepository = associateRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public LoginResponse login(LoginRequest request) {
        Associate associate = associateRepository.findByEmail(request.email())
            .orElseThrow(InvalidCredentialsException::new);

        if (!passwordEncoder.matches(request.password(), associate.getPasswordHash())) {
            throw new InvalidCredentialsException();
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
