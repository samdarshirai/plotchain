package com.plotchain.company;

public class InvalidAdminRoleException extends RuntimeException {
    public InvalidAdminRoleException(String role) {
        super("Invalid admin role: " + role);
    }
}
