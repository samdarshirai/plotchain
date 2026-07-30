package com.plotchain.company;

public class RootAssociateAlreadyExistsException extends RuntimeException {
    public RootAssociateAlreadyExistsException() {
        super("A root associate already exists.");
    }
}
