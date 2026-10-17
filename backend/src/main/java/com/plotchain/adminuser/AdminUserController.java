package com.plotchain.adminuser;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
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
    public List<AdminUserResponse> list() {
        return service.list();
    }

    @PostMapping
    public ResponseEntity<AdminUserResponse> create(@Valid @RequestBody AdminUserRequest request,
                                                    @AuthenticationPrincipal UUID actorId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request, actorId));
    }

    @PutMapping("/{id}")
    public AdminUserResponse update(@PathVariable UUID id, @Valid @RequestBody AdminUserRequest request,
                                    @AuthenticationPrincipal UUID actorId) {
        return service.update(id, request, actorId);
    }

    @PostMapping("/{id}/reset-password")
    public AdminUserResponse resetPassword(@PathVariable UUID id, @AuthenticationPrincipal UUID actorId) {
        return service.resetPassword(id, actorId);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id, @AuthenticationPrincipal UUID actorId) {
        service.delete(id, actorId);
        return ResponseEntity.noContent().build();
    }
}
