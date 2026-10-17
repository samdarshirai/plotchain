package com.plotchain.auth;

public class ImpersonationNotAllowedException extends RuntimeException {
    public ImpersonationNotAllowedException() {
        super("Only associate accounts can be impersonated");
    }
}
