package com.plotchain.epin;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

// Short-lived proof that an associate just passed the transaction-password check, so the e-Pin
// Register screens can sit behind it without re-sending the password on every list request.
// ponytail: in-memory, lost on restart and not shared across instances; move to Redis/DB if we scale out.
@Component
public class EPinUnlockStore {

    static final Duration TTL = Duration.ofMinutes(10);

    private record Entry(UUID associateId, Instant expiresAt) {}

    private final ConcurrentHashMap<String, Entry> tokens = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();
    private final Clock clock;

    public EPinUnlockStore(Clock clock) {
        this.clock = clock;
    }

    public EPinUnlockResponse issue(UUID associateId) {
        Instant now = clock.instant();
        tokens.values().removeIf(e -> !e.expiresAt().isAfter(now));
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        Instant expiresAt = now.plus(TTL);
        tokens.put(token, new Entry(associateId, expiresAt));
        return new EPinUnlockResponse(token, expiresAt);
    }

    public void require(UUID associateId, String token) {
        Entry e = token == null ? null : tokens.get(token);
        if (e == null || !e.associateId().equals(associateId) || !e.expiresAt().isAfter(clock.instant())) {
            throw new EPinLockedException();
        }
    }
}
