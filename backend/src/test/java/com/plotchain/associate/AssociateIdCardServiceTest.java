package com.plotchain.associate;

import com.plotchain.income.DesignationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssociateIdCardServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock DesignationService designationService;

    AssociateIdCardService service;
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();
    private static final UUID RANK_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new AssociateIdCardService(associateRepository, designationService);
    }

    private Associate associateWithRank() {
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setUserId("VP00001");
        a.setName("Asha Rao");
        a.setRankId(RANK_ID);
        return a;
    }

    @Test
    void returnsIdCardWithIdNumberNameDesignationAndQrPayload() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithRank()));
        when(designationService.designationOf(ASSOCIATE_ID)).thenReturn("Sales Manager");

        AssociateIdCardResponse response = service.getMyIdCard(ASSOCIATE_ID);

        assertThat(response.idNumber()).isEqualTo("VP00001");
        assertThat(response.name()).isEqualTo("Asha Rao");
        assertThat(response.designation()).isEqualTo("Sales Manager");
        assertThat(response.qrPayload()).isEqualTo("VP00001");
    }

    @Test
    void photoUrlIsAlwaysNull() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithRank()));

        AssociateIdCardResponse response = service.getMyIdCard(ASSOCIATE_ID);

        assertThat(response.photoUrl()).isNull();
    }

    @Test
    void throwsAssociateNotFoundExceptionWhenAssociateMissing() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getMyIdCard(ASSOCIATE_ID))
            .isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void throwsNoRankAssignedExceptionWhenRankIdIsNull() {
        Associate associate = associateWithRank();
        associate.setRankId(null);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> service.getMyIdCard(ASSOCIATE_ID))
            .isInstanceOf(NoRankAssignedException.class);
    }
}
