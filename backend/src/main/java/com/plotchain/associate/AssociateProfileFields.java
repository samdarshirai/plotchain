package com.plotchain.associate;

import java.time.LocalDate;

// Full profile collected by every add-associate path (admin create and associate e-Pin Join).
// Both request records implement it through their matching accessors.
public interface AssociateProfileFields {
    String name();
    String sponsorUserId();
    String position();
    String fatherHusbandName();
    String panNumber();
    String aadhaarNumber();
    LocalDate dateOfBirth();
    String gender();
    String maritalStatus();
    String email();
    String phone();
    String state();
    String district();
    String address();
    String postalCode();
    String nomineeName();
    String nomineeRelation();
}
