package com.plotchain.associate;

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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssociateNomineeServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock AssociateNomineeRepository associateNomineeRepository;
    @Mock TransactionPasswordVerifier transactionPasswordVerifier;

    AssociateNomineeService service;
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new AssociateNomineeService(associateRepository, associateNomineeRepository, transactionPasswordVerifier);
    }

    private Associate seededAssociate() {
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        return a;
    }

    private AssociateNominee seededNominee() {
        AssociateNominee n = new AssociateNominee();
        n.setId(UUID.randomUUID());
        n.setAssociateId(ASSOCIATE_ID);
        n.setNomineeName("Kajal Devi");
        n.setRelation("Wife");
        return n;
    }

    @Test
    void getNomineeReturnsEmptyFieldsWhenNoRowExistsYet() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(seededAssociate()));
        when(associateNomineeRepository.findByAssociateId(ASSOCIATE_ID)).thenReturn(Optional.empty());

        AssociateNomineeResponse response = service.getNominee(ASSOCIATE_ID);

        assertThat(response.nomineeName()).isNull();
        assertThat(response.relation()).isNull();
    }

    @Test
    void getNomineeReturnsExistingRow() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(seededAssociate()));
        when(associateNomineeRepository.findByAssociateId(ASSOCIATE_ID)).thenReturn(Optional.of(seededNominee()));

        AssociateNomineeResponse response = service.getNominee(ASSOCIATE_ID);

        assertThat(response.nomineeName()).isEqualTo("Kajal Devi");
        assertThat(response.relation()).isEqualTo("Wife");
    }

    @Test
    void getNomineeThrowsWhenAssociateNotFound() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getNominee(ASSOCIATE_ID))
            .isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void updateNomineeCreatesANewRowWhenNoneExists() {
        Associate associate = seededAssociate();
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));
        when(associateNomineeRepository.findByAssociateId(ASSOCIATE_ID)).thenReturn(Optional.empty());
        when(associateNomineeRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        AssociateNomineeResponse response = service.updateNominee(ASSOCIATE_ID,
            new UpdateAssociateNomineeRequest("Kajal Devi", "Wife", null));

        assertThat(response.nomineeName()).isEqualTo("Kajal Devi");
        assertThat(response.relation()).isEqualTo("Wife");
        verify(transactionPasswordVerifier).requireIfSet(associate, null);
    }

    @Test
    void updateNomineeThrowsWhenAssociateNotFound() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.updateNominee(ASSOCIATE_ID,
            new UpdateAssociateNomineeRequest("Kajal Devi", "Wife", null)))
            .isInstanceOf(AssociateNotFoundException.class);
        verify(associateNomineeRepository, never()).save(any());
    }

    @Test
    void updateNomineePropagatesTheVerifiersRejectionAndDoesNotSave() {
        Associate associate = seededAssociate();
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));
        org.mockito.Mockito.doThrow(new InvalidTransactionPasswordException("bad"))
            .when(transactionPasswordVerifier).requireIfSet(any(), any());

        assertThatThrownBy(() -> service.updateNominee(ASSOCIATE_ID,
            new UpdateAssociateNomineeRequest("Kajal Devi", "Wife", "wrong")))
            .isInstanceOf(InvalidTransactionPasswordException.class);
        verify(associateNomineeRepository, never()).save(any());
    }
}
