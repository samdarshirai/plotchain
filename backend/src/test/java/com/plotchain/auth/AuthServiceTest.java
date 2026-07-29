package com.plotchain.auth;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock AssociateRepository associateRepository;

    PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    JwtService jwtService = new JwtService("test-secret-key-at-least-32-bytes-long-for-hs256", 60);
    AuthService authService;

    @BeforeEach
    void setUp() {
        authService = new AuthService(associateRepository, passwordEncoder, jwtService);
    }

    @Test
    void issuesATokenForValidCredentials() {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("Password123!"));
        when(associateRepository.findByEmail("jane@plotchain.test")).thenReturn(Optional.of(associate));

        LoginResponse response = authService.login(new LoginRequest("jane@plotchain.test", "Password123!"));

        assertThat(response.token()).isNotBlank();
        assertThat(response.associateId()).isEqualTo(associate.getId());
        assertThat(response.role()).isEqualTo("ASSOCIATE");
    }

    @Test
    void rejectsAnUnknownEmail() {
        when(associateRepository.findByEmail("nobody@plotchain.test")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login(new LoginRequest("nobody@plotchain.test", "whatever")))
            .isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void rejectsAWrongPassword() {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("Password123!"));
        when(associateRepository.findByEmail("jane@plotchain.test")).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> authService.login(new LoginRequest("jane@plotchain.test", "wrong-password")))
            .isInstanceOf(InvalidCredentialsException.class);
    }
}
