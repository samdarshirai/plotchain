package com.plotchain.associate;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// role-capability unit 10 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
// "Digital ID card" row -- Associate sees "Own ID card only (photo, ID number, rank, QR)"). A
// bare @RestController with one route, same shape as AssociateRankProgressController/
// PasswordController/DashboardController -- lives in the associate package (not compensation or
// tree) because this is identity/profile data, not a compensation computation or genealogy
// data.
//
// No SecurityConfig matcher needed: this is a bare GET, which never collides with the blanket
// POST/PUT/PATCH/DELETE write rules there, so it falls through to anyRequest().authenticated()
// the same way GET /api/associates/me/dashboard, GET /api/associates/me/rank-progress, and GET
// /api/associates/me/kyc already do with no matcher of their own.
@RestController
public class AssociateIdCardController {

    private final AssociateIdCardService associateIdCardService;

    public AssociateIdCardController(AssociateIdCardService associateIdCardService) {
        this.associateIdCardService = associateIdCardService;
    }

    // Self-scoped by construction: the target associate comes from the verified JWT, never from
    // the request -- no caller can view another associate's ID card through this route, same
    // reasoning as PasswordController.changePassword(...) /
    // AssociateRankProgressController.getMyRankProgress(...).
    @GetMapping("/api/associates/me/id-card")
    public AssociateIdCardResponse getMyIdCard(@AuthenticationPrincipal UUID associateId) {
        return associateIdCardService.getMyIdCard(associateId);
    }
}
