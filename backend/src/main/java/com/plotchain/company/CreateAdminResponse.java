package com.plotchain.company;

import java.util.UUID;

/**
 * The temporary password is returned exactly once, at creation. It is never stored in
 * plaintext and cannot be retrieved again -- the founding admin communicates it to the new
 * admin out-of-band, and the new admin must change it on first login. userId is the new
 * admin's login identifier, unchanged from what was requested.
 */
public record CreateAdminResponse(UUID id, String userId, String role, String temporaryPassword) {}
