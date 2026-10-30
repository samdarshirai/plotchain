package com.plotchain.associate;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;

@Component
public class AssociateIdGenerator {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int MAX_ATTEMPTS = 1000;

    private final AssociateRepository associateRepository;
    private final String associateIdPrefix;

    public AssociateIdGenerator(
        AssociateRepository associateRepository,
        @Value("${plotchain.associate-id-prefix:VSA5}") String associateIdPrefix
    ) {
        this.associateRepository = associateRepository;
        this.associateIdPrefix = associateIdPrefix;
    }

    // Generates the prefix plus a random 4-digit suffix (e.g. VSA58304), retrying on collision.
    // ponytail: only 10,000 IDs per prefix -- retries climb as the table fills and it throws once
    // MAX_ATTEMPTS misses in a row; widen the suffix if that ever gets close.
    // The unique index on associate.user_id is the real backstop against a concurrent race.
    public String generate() {
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            String candidate = String.format("%s%04d", associateIdPrefix, RANDOM.nextInt(10_000));
            if (!associateRepository.existsByUserId(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException("No free associate IDs left for prefix " + associateIdPrefix);
    }
}
