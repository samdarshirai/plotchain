package com.plotchain.company;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/company/admins")
public class AdminController {

    private final AdminProvisioningService adminProvisioningService;

    public AdminController(AdminProvisioningService adminProvisioningService) {
        this.adminProvisioningService = adminProvisioningService;
    }

    @PostMapping
    public ResponseEntity<CreateAdminResponse> create(
            @Valid @RequestBody CreateAdminRequest request,
            @AuthenticationPrincipal UUID actorId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(adminProvisioningService.create(request, actorId));
    }

    @GetMapping
    public List<AdminSummaryResponse> list() {
        return adminProvisioningService.list();
    }

    @GetMapping("/user-id-available")
    public UserIdAvailabilityResponse isUserIdAvailable(@RequestParam String userId) {
        return new UserIdAvailabilityResponse(adminProvisioningService.isUserIdAvailable(userId));
    }

    @GetMapping("/role-permissions")
    public Map<String, List<String>> rolePermissions() {
        return AdminRolePermissions.all();
    }
}
