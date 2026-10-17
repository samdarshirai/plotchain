package com.plotchain.adminuser;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateStatus;

import java.time.Instant;
import java.util.UUID;

public record AdminUserResponse(UUID id, String userId, String name, String phone, String email,
                                AssociateStatus status, Instant lastLoginAt, String temporaryPassword) {

    static AdminUserResponse of(Associate a) {
        return of(a, null);
    }

    static AdminUserResponse of(Associate a, String temporaryPassword) {
        return new AdminUserResponse(a.getId(), a.getUserId(), a.getName(), a.getPhone(), a.getEmail(),
            a.getStatus(), a.getLastActiveAt(), temporaryPassword);
    }
}
