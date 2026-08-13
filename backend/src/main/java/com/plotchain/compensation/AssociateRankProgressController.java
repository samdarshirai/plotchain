package com.plotchain.compensation;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// role-capability unit 9 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
// "Compensation rules" row -- Associate sees "View own rank progress / reward tiers
// (read-only)"). A bare @RestController with one route, same shape as
// DashboardController/PasswordController/AssociateSaleController -- not added to
// CompensationPlanController, whose class-level @RequestMapping("/api/company/compensation")
// would make an absolute-path method mapping here compose incorrectly (Spring concatenates
// class + method paths rather than treating a leading "/" as an override).
//
// No SecurityConfig matcher needed: this is a bare GET, which never collides with the blanket
// POST/PUT/PATCH/DELETE write rules there, so it falls through to anyRequest().authenticated()
// the same way GET /api/associates/me/dashboard and GET /api/associates/me/sales already do.
@RestController
public class AssociateRankProgressController {

    private final CompensationPlanService compensationPlanService;

    public AssociateRankProgressController(CompensationPlanService compensationPlanService) {
        this.compensationPlanService = compensationPlanService;
    }

    // Self-scoped by construction: the target associate comes from the verified JWT, never
    // from the request -- no caller can view another associate's rank progress through this
    // route, same reasoning as PasswordController.changePassword(...) /
    // AssociateSaleController.getMySales(...).
    @GetMapping("/api/associates/me/rank-progress")
    public AssociateRankProgressResponse getMyRankProgress(@AuthenticationPrincipal UUID associateId) {
        return compensationPlanService.getMyRankProgress(associateId);
    }
}
