package com.plotchain.company;

import java.util.UUID;

/**
 * The temporary password is returned exactly once, at creation. It is never stored in
 * plaintext and cannot be retrieved again -- the founding admin communicates it to the root
 * associate out-of-band, and the associate must change it on first login.
 */
public record RootAssociateCreationResult(
    UUID associateId,
    String userId,
    String temporaryPassword,
    String name,
    String slotLabel
) {}
