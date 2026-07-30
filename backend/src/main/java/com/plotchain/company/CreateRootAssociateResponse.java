package com.plotchain.company;

// right is null when seedRightRoot was false.
public record CreateRootAssociateResponse(RootAssociateCreationResult left, RootAssociateCreationResult right) {}
