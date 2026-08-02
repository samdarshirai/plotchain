package com.plotchain.auth;

public class AssociateSuspendedException extends RuntimeException {
    public AssociateSuspendedException() {
        super("Your account has been suspended. Please contact your administrator.");
    }
}
