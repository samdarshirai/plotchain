package com.plotchain.associate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssociateStatusCacheTest {

    @Mock AssociateRepository associateRepository;

    AssociateStatusCache cache;

    @BeforeEach
    void setUp() {
        cache = new AssociateStatusCache(associateRepository);
    }

    private Associate newAssociate(UUID id, AssociateStatus status) {
        Associate a = new Associate();
        a.setId(id);
        a.setStatus(status);
        return a;
    }

    @Test
    void isActiveReturnsTrueForAnActiveAssociate() {
        UUID id = UUID.randomUUID();
        when(associateRepository.findById(id)).thenReturn(Optional.of(newAssociate(id, AssociateStatus.ACTIVE)));

        assertThat(cache.isActive(id)).isTrue();
    }

    @Test
    void isActiveReturnsFalseForASuspendedAssociate() {
        UUID id = UUID.randomUUID();
        when(associateRepository.findById(id)).thenReturn(Optional.of(newAssociate(id, AssociateStatus.SUSPENDED)));

        assertThat(cache.isActive(id)).isFalse();
    }

    @Test
    void isActiveReturnsFalseWhenAssociateDoesNotExist() {
        UUID id = UUID.randomUUID();
        when(associateRepository.findById(id)).thenReturn(Optional.empty());

        assertThat(cache.isActive(id)).isFalse();
    }

    @Test
    void isActiveOnlyHitsTheRepositoryOnceBeforeEviction() {
        UUID id = UUID.randomUUID();
        when(associateRepository.findById(id)).thenReturn(Optional.of(newAssociate(id, AssociateStatus.ACTIVE)));

        cache.isActive(id);
        cache.isActive(id);

        verify(associateRepository, times(1)).findById(id);
    }

    @Test
    void evictForcesTheNextIsActiveCallToReReadTheRepository() {
        UUID id = UUID.randomUUID();
        when(associateRepository.findById(id))
            .thenReturn(Optional.of(newAssociate(id, AssociateStatus.ACTIVE)))
            .thenReturn(Optional.of(newAssociate(id, AssociateStatus.SUSPENDED)));

        assertThat(cache.isActive(id)).isTrue();
        cache.evict(id);
        assertThat(cache.isActive(id)).isFalse();

        verify(associateRepository, times(2)).findById(id);
    }
}
