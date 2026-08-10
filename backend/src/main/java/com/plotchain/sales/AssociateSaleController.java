package com.plotchain.sales;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Sales unit 7 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
// "Associate own view -- GET /api/associates/me/sales, any authenticated associate"): a bare
// @RestController with one route, same shape as DashboardController and PasswordController --
// not added to SaleController, whose class-level @RequestMapping("/api/admin/sales") would make
// an absolute-path method mapping here compose incorrectly (Spring concatenates class + method
// paths rather than treating a leading "/" as an override).
//
// No SecurityConfig matcher needed: this is a bare GET, which never collides with the blanket
// POST/PUT/PATCH/DELETE write rules there, so it falls through to anyRequest().authenticated()
// the same way GET /api/associates/me/dashboard already does with no matcher of its own.
@RestController
public class AssociateSaleController {

    private final SaleService saleService;

    public AssociateSaleController(SaleService saleService) {
        this.saleService = saleService;
    }

    // Self-scoped by construction: the target associate comes from the verified JWT, never
    // from the request, so no caller can view another associate's sales through this route --
    // same reasoning as PasswordController.changePassword(...).
    @GetMapping("/api/associates/me/sales")
    public AssociateSalePageResponse getMySales(
            @AuthenticationPrincipal UUID associateId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return saleService.getMySales(associateId, page, size);
    }
}
