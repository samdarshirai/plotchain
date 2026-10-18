package com.plotchain.advanceloan;

import java.util.List;

public record AdvanceLoanDetailResponse(AdvanceLoanResponse loan, String associatePhone, List<LoanRepaymentResponse> repayments) {}
