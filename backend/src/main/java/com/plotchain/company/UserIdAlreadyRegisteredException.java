package com.plotchain.company;

public class UserIdAlreadyRegisteredException extends RuntimeException {
    public UserIdAlreadyRegisteredException(String userId) {
        super("User ID already registered: " + userId);
    }
}
