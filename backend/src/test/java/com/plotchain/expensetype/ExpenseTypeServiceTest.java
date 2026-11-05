package com.plotchain.expensetype;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ExpenseTypeServiceTest {

    @Mock ExpenseTypeRepository repository;
    @Mock SettingsAuditLogRepository auditLogRepository;
    @Mock AssociateRepository associateRepository;
    @Mock com.plotchain.compensation.RewardTierRepository rewardTierRepository;

    ExpenseTypeService service;

    @BeforeEach
    void setUp() {
        SettingsAuditService audit = new SettingsAuditService(auditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        service = new ExpenseTypeService(repository, audit, rewardTierRepository);
    }

    @Test
    void createTrimsAndDefaultsToActive() {
        ExpenseTypeResponse r = service.create(new ExpenseTypeRequest(" Travel ", null), UUID.randomUUID());
        assertThat(r.name()).isEqualTo("Travel");
        assertThat(r.status()).isEqualTo(ExpenseType.Status.ACTIVE);
        verify(repository).save(any(ExpenseType.class));
    }

    @Test
    void createRejectsDuplicateName() {
        when(repository.existsByNameIgnoreCase("Travel")).thenReturn(true);
        assertThatThrownBy(() -> service.create(new ExpenseTypeRequest("Travel", null), UUID.randomUUID()))
            .isInstanceOf(ExpenseTypeException.class);
    }

    @Test
    void updateChangesStatus() {
        UUID id = UUID.randomUUID();
        when(repository.findById(id)).thenReturn(Optional.of(new ExpenseType(id)));
        ExpenseTypeResponse r = service.update(id, new ExpenseTypeRequest("Fuel", ExpenseType.Status.INACTIVE), UUID.randomUUID());
        assertThat(r.name()).isEqualTo("Fuel");
        assertThat(r.status()).isEqualTo(ExpenseType.Status.INACTIVE);
    }

    @Test
    void deactivatingATypeUsedByARewardTierPerkIsRejected() {
        UUID id = UUID.randomUUID();
        ExpenseType type = new ExpenseType(id);
        type.setName("Trip");
        when(repository.findById(id)).thenReturn(java.util.Optional.of(type));
        when(rewardTierRepository.existsByPerkExpenseTypeId(id)).thenReturn(true);

        assertThatThrownBy(() -> service.update(id,
            new ExpenseTypeRequest("Trip", ExpenseType.Status.INACTIVE), UUID.randomUUID()))
            .isInstanceOf(ExpenseTypeException.class)
            .hasMessageContaining("reward tier");
    }
}
