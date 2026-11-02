package com.plotchain.associate;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class AssociateProvisioningExceptionHandlerTest {

    AssociateProvisioningExceptionHandler handler = new AssociateProvisioningExceptionHandler();

    @Test
    void sponsorRequiredMapsTo409WithMessage() {
        ResponseEntity<Map<String, String>> res = handler.handleSponsorRequired(new SponsorRequiredException());

        assertThat(res.getStatusCode().value()).isEqualTo(409);
        assertThat(res.getBody()).containsEntry("error", "A sponsor is required: the root user already exists");
    }
}
