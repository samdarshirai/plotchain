package com.plotchain.associate;

// Lets the frontend's Transaction Password tab decide whether to render a "current password"
// field (isSet true) or only new/confirm (bootstrapping, isSet false) -- same reasoning
// AssociateBankDetailsResponse.empty() lets the Bank Details tab distinguish "no row yet" from
// an error.
public record TransactionPasswordStatusResponse(boolean isSet) {}
