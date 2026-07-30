package com.plotchain.associate;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class AssociateIdGenerator {

    private final AssociateRepository associateRepository;
    private final String associateIdPrefix;

    public AssociateIdGenerator(
        AssociateRepository associateRepository,
        @Value("${plotchain.associate-id-prefix:VP}") String associateIdPrefix
    ) {
        this.associateRepository = associateRepository;
        this.associateIdPrefix = associateIdPrefix;
    }

    // Generates a fixed-width, zero-padded ID (e.g. VP00001, VP00002, ...) so that string
    // ordering matches numeric ordering, letting findTopByUserIdStartingWithOrderByUserIdDesc
    // work without native SQL. Re-checks existsByUserId defensively before returning: two
    // concurrent provisioning calls could otherwise compute the same next number.
    public String generate() {
        int next = associateRepository.findTopByUserIdStartingWithOrderByUserIdDesc(associateIdPrefix)
            .map(Associate::getUserId)
            .map(existingId -> {
                try {
                    return Integer.parseInt(existingId.substring(associateIdPrefix.length())) + 1;
                } catch (NumberFormatException e) {
                    return 1;
                }
            })
            .orElse(1);

        String candidate;
        do {
            candidate = String.format("%s%05d", associateIdPrefix, next);
            next++;
        } while (associateRepository.existsByUserId(candidate));
        return candidate;
    }
}
