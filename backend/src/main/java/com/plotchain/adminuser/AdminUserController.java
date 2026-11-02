package com.plotchain.adminuser;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import com.plotchain.associate.AssociateRole;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/users")
@PreAuthorize("hasAuthority('ADMIN')")
public class AdminUserController {

    private final AdminUserService service;

    public AdminUserController(AdminUserService service) {
        this.service = service;
    }

    @GetMapping
    public List<AdminUserResponse> list(Authentication auth) {
        return service.list(actorRole(auth));
    }

    @PostMapping
    public ResponseEntity<AdminUserResponse> create(@Valid @RequestBody AdminUserRequest request,
                                                    @AuthenticationPrincipal UUID actorId, Authentication auth) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request, actorId, actorRole(auth)));
    }

    @PutMapping("/{id}")
    public AdminUserResponse update(@PathVariable UUID id, @Valid @RequestBody AdminUserRequest request,
                                    @AuthenticationPrincipal UUID actorId, Authentication auth) {
        return service.update(id, request, actorId, actorRole(auth));
    }

    @PostMapping("/{id}/reset-password")
    public AdminUserResponse resetPassword(@PathVariable UUID id, @AuthenticationPrincipal UUID actorId,
                                           Authentication auth) {
        return service.resetPassword(id, actorId, actorRole(auth));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id, @AuthenticationPrincipal UUID actorId,
                                       Authentication auth) {
        service.delete(id, actorId, actorRole(auth));
        return ResponseEntity.noContent().build();
    }

    // A MANAGER token carries both ADMIN and MANAGER authorities (JwtAuthenticationFilter).
    static AssociateRole actorRole(Authentication auth) {
        return auth.getAuthorities().stream().anyMatch(a -> "MANAGER".equals(a.getAuthority()))
            ? AssociateRole.MANAGER : AssociateRole.ADMIN;
    }
}
