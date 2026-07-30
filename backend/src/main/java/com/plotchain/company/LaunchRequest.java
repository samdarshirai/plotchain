package com.plotchain.company;

import jakarta.validation.constraints.AssertTrue;

public record LaunchRequest(
    @AssertTrue(message = "terms of service and privacy policy must be accepted") boolean acceptTerms
) {}
