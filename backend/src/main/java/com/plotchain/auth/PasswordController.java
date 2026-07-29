package com.plotchain.auth;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class PasswordController {

    private final AuthService authService;

    public PasswordController(AuthService authService) {
        this.authService = authService;
    }

    // Self-scoped by construction: the target associate comes from the verified JWT, never
    // from the request, so no caller can change another associate's password.
    @PostMapping("/api/associates/me/password")
    public ResponseEntity<Void> changePassword(
        @AuthenticationPrincipal UUID associateId,
        @Valid @RequestBody ChangePasswordRequest request
    ) {
        authService.changePassword(associateId, request);
        return ResponseEntity.noContent().build();
    }
}
