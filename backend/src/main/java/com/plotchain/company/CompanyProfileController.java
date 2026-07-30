package com.plotchain.company;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/company")
public class CompanyProfileController {

    private final CompanyProfileService companyProfileService;

    public CompanyProfileController(CompanyProfileService companyProfileService) {
        this.companyProfileService = companyProfileService;
    }

    @GetMapping("/profile")
    public CompanyProfileResponse getProfile() {
        return companyProfileService.getProfile();
    }

    @PutMapping("/profile")
    public CompanyProfileResponse updateProfile(
            @Valid @RequestBody CompanyProfileRequest request,
            @AuthenticationPrincipal UUID actorId) {
        return companyProfileService.updateProfile(request, actorId);
    }
}
