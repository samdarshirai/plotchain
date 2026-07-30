package com.plotchain.auth;

public class PlatformNotLiveException extends RuntimeException {
    public PlatformNotLiveException() {
        super("This platform has not launched yet. Please contact your administrator.");
    }
}
