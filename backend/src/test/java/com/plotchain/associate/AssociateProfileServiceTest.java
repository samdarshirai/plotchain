package com.plotchain.associate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssociateProfileServiceTest {

    @Mock AssociateRepository associateRepository;

    AssociateProfileService service;
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new AssociateProfileService(associateRepository);
    }

    private Associate seeded() {
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setPhone("9990001111");
        a.setEmail("jane@example.com");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setJoinedAt(Instant.parse("2026-01-01T00:00:00Z"));
        return a;
    }

    @Test
    void getProfileReturnsTheAssociatesOwnFields() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(seeded()));

        AssociateProfileResponse response = service.getProfile(ASSOCIATE_ID);

        assertThat(response.userId()).isEqualTo("VP00001");
        assertThat(response.name()).isEqualTo("Jane Doe");
        assertThat(response.phone()).isEqualTo("9990001111");
        assertThat(response.email()).isEqualTo("jane@example.com");
    }

    @Test
    void getProfileThrowsWhenAssociateNotFound() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getProfile(ASSOCIATE_ID))
            .isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void updateProfileChangesNamePhoneAndEmail() {
        Associate associate = seeded();
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));
        when(associateRepository.existsByEmail("jane.doe@example.com")).thenReturn(false);
        UpdateAssociateProfileRequest request =
            new UpdateAssociateProfileRequest("Jane A. Doe", "9990002222", "jane.doe@example.com");

        AssociateProfileResponse response = service.updateProfile(ASSOCIATE_ID, request);

        assertThat(response.name()).isEqualTo("Jane A. Doe");
        assertThat(response.phone()).isEqualTo("9990002222");
        assertThat(response.email()).isEqualTo("jane.doe@example.com");
        assertThat(associate.getName()).isEqualTo("Jane A. Doe");
        assertThat(associate.getPhone()).isEqualTo("9990002222");
        assertThat(associate.getEmail()).isEqualTo("jane.doe@example.com");
        verify(associateRepository).save(associate);
    }

    @Test
    void updateProfileAllowsResubmittingTheAssociatesOwnUnchangedEmail() {
        Associate associate = seeded();
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));
        UpdateAssociateProfileRequest request =
            new UpdateAssociateProfileRequest("Jane Doe", "9990001111", "jane@example.com");

        AssociateProfileResponse response = service.updateProfile(ASSOCIATE_ID, request);

        assertThat(response.email()).isEqualTo("jane@example.com");
        // Own unchanged email must never trip the uniqueness check against itself.
        verify(associateRepository, never()).existsByEmail(any());
    }

    @Test
    void updateProfileRejectsAnEmailAlreadyRegisteredToAnotherAssociate() {
        Associate associate = seeded();
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));
        when(associateRepository.existsByEmail("taken@example.com")).thenReturn(true);
        UpdateAssociateProfileRequest request =
            new UpdateAssociateProfileRequest("Jane Doe", "9990001111", "taken@example.com");

        assertThatThrownBy(() -> service.updateProfile(ASSOCIATE_ID, request))
            .isInstanceOf(EmailAlreadyRegisteredException.class);

        // Email must not be applied to the entity, and no save on the rejected path.
        assertThat(associate.getEmail()).isEqualTo("jane@example.com");
        verify(associateRepository, never()).save(any());
    }

    @Test
    void updateProfileClearsEmailWhenRequestOmitsIt() {
        Associate associate = seeded();
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));
        UpdateAssociateProfileRequest request =
            new UpdateAssociateProfileRequest("Jane Doe", "9990001111", null);

        AssociateProfileResponse response = service.updateProfile(ASSOCIATE_ID, request);

        assertThat(response.email()).isNull();
        assertThat(associate.getEmail()).isNull();
        verify(associateRepository, never()).existsByEmail(any());
    }

    @Test
    void updateProfileThrowsWhenAssociateNotFound() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());
        UpdateAssociateProfileRequest request =
            new UpdateAssociateProfileRequest("Jane Doe", "9990001111", "jane@example.com");

        assertThatThrownBy(() -> service.updateProfile(ASSOCIATE_ID, request))
            .isInstanceOf(AssociateNotFoundException.class);
    }
}
