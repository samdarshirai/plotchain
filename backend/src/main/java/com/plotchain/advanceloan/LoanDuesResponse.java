package com.plotchain.advanceloan;

import java.math.BigDecimal;
import java.util.UUID;

public record LoanDuesResponse(UUID associateId, BigDecimal outstanding) {}
