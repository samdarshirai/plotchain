package com.plotchain.associate;

import java.util.UUID;

/**
 * The temporary password is returned exactly once, at creation. It is never stored in
 * plaintext and cannot be retrieved again — the admin communicates it to the associate
 * out-of-band, and the associate must change it on first login. userId is the associate's
 * login identifier (e.g. VP00001) — without it the admin has no way to tell the associate
 * what to log in with.
 */
public record CreateAssociateResponse(UUID associateId, String userId, String temporaryPassword) {}
