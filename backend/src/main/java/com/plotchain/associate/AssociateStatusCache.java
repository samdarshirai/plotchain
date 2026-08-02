package com.plotchain.associate;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.UUID;

/**
 * In-process cache of associate status, checked on every authenticated request so a
 * suspended associate's still-valid JWT stops working on their next request rather than
 * only at natural token expiry. AdminAssociateService evicts explicitly on suspend/reactivate;
 * the TTL here is only a safety net for any path that misses that eviction.
 */
@Component
public class AssociateStatusCache {

    private static final int MAX_ENTRIES = 10_000;
    private static final Duration TTL = Duration.ofSeconds(30);

    private final AssociateRepository associateRepository;
    private final Cache<UUID, AssociateStatus> cache;

    public AssociateStatusCache(AssociateRepository associateRepository) {
        this.associateRepository = associateRepository;
        this.cache = Caffeine.newBuilder()
            .expireAfterWrite(TTL)
            .maximumSize(MAX_ENTRIES)
            .build();
    }

    public boolean isActive(UUID associateId) {
        AssociateStatus status = cache.get(associateId, this::loadStatus);
        return status == AssociateStatus.ACTIVE;
    }

    public void evict(UUID associateId) {
        cache.invalidate(associateId);
    }

    private AssociateStatus loadStatus(UUID associateId) {
        return associateRepository.findById(associateId).map(Associate::getStatus).orElse(null);
    }
}
