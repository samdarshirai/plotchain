package com.plotchain.associate;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AssociateRoleTest {

    @Test
    void everyRoleExceptAssociateIsAdminFamily() {
        assertThat(AssociateRole.ADMIN.isAdminFamily()).isTrue();
        assertThat(AssociateRole.SUPER_ADMIN.isAdminFamily()).isTrue();
        assertThat(AssociateRole.FINANCE.isAdminFamily()).isTrue();
        assertThat(AssociateRole.KYC_REVIEWER.isAdminFamily()).isTrue();
        assertThat(AssociateRole.SUPPORT.isAdminFamily()).isTrue();
    }

    @Test
    void associateIsNotAdminFamily() {
        assertThat(AssociateRole.ASSOCIATE.isAdminFamily()).isFalse();
    }
}
