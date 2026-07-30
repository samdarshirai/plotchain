package com.plotchain.company;

import java.util.List;
import java.util.Map;

/**
 * A static description of what each assignable admin-family role can do, for the setup
 * wizard's read-only Permissions Preview. This is documentation only -- no
 * {@code @PreAuthorize} annotation or {@code SecurityConfig} rule reads from this map.
 * Per-role authority narrowing is a named follow-up; today every admin-family role still
 * carries the same "may write" authority granted by {@code AssociateRole.isAdminFamily()}.
 */
public final class AdminRolePermissions {

    private static final Map<String, List<String>> PERMISSIONS = Map.of(
        "SUPER_ADMIN", List.of("Full access to all settings and data"),
        "FINANCE", List.of("View payouts", "Approve withdrawals", "Export reports"),
        "KYC_REVIEWER", List.of("Review KYC submissions", "Approve/reject documents"),
        "SUPPORT", List.of("View associate profiles", "View tickets")
    );

    private AdminRolePermissions() {
    }

    public static Map<String, List<String>> all() {
        return PERMISSIONS;
    }
}
