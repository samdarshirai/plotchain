package com.plotchain.associate;

import java.util.UUID;

/**
 * The temporary password is returned exactly once, at creation. It is never stored in
 * plaintext and cannot be retrieved again — the admin communicates it to the associate
 * out-of-band, and the associate must change it on first login.
 */
public record CreateAssociateResponse(UUID associateId, String temporaryPassword) {}
