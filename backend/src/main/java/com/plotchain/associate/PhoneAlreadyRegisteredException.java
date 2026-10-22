package com.plotchain.associate;

public class PhoneAlreadyRegisteredException extends RuntimeException {
    public PhoneAlreadyRegisteredException(String phone) {
        super("Phone already registered: " + phone);
    }
}
