package com.plotchain.withdrawal;

// Wallet/withdrawal unit 7 (Flow "Decide" steps 3-4): the request BODY itself is invalid --
// decision isn't APPROVED/REJECTED, or reason is blank on a REJECTED decision -- independent of
// the withdrawal request's current status. Mirrors com.plotchain.associate.InvalidKycDecisionException
// exactly (same single-exception-class-mapped-to-one-status shape, same two trigger cases: bad
// decision value, missing reason on reject), per the spec's own "mirrors KYC's reason required
// when rejecting" note on the blank-reason case.
public class InvalidWithdrawalDecisionException extends RuntimeException {
    public InvalidWithdrawalDecisionException(String message) {
        super(message);
    }
}
