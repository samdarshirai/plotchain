package com.plotchain.associate;

import java.util.List;

public record AssociateKycStatusResponse(KycStatus kycStatus, List<KycDocumentSummary> documents) {}
