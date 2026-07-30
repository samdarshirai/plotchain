package com.plotchain.company;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class AdminRolePermissionsTest {

    @Test
    void everyAssignableRoleHasANonEmptyPermissionList() {
        Map<String, List<String>> permissions = AdminRolePermissions.all();

        assertThat(permissions).containsOnlyKeys("SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT");
        permissions.values().forEach(list -> assertThat(list).isNotEmpty());
    }

    @Test
    void associateAndAdminAreAbsent() {
        Map<String, List<String>> permissions = AdminRolePermissions.all();

        assertThat(permissions).doesNotContainKeys("ASSOCIATE", "ADMIN");
    }
}
