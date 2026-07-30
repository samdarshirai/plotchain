package com.plotchain.company;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.AssociateRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CompanyProfileServiceTest {

    @Mock CompanyProfileRepository companyProfileRepository;
    // SettingsAuditService is a concrete class -- this JDK's Mockito/ByteBuddy can't instrument
    // concrete classes (see AuthControllerTest), so a real instance is built over mocked
    // (interface) repositories instead, per the repo's established pattern. Audit calls are
    // asserted via the settingsAuditLogRepository.save(...) captor, same as SettingsAuditServiceTest.
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;
    @Mock AssociateRepository associateRepository;

    CompanyProfileService companyProfileService;

    private static final UUID ACTOR_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        companyProfileService = new CompanyProfileService(companyProfileRepository, settingsAuditService);
    }

    private CompanyProfile blankProfile() {
        return new CompanyProfile();
    }

    private CompanyProfileRequest filledRequest() {
        return new CompanyProfileRequest(
            "Plotchain Estates",
            "Plotchain Estates Private Limited",
            "22AAAAA0000A1Z5",
            "Jane Doe",
            "+919876543210",
            "jane@plotchain.test",
            "123 MG Road, Bengaluru"
        );
    }

    @Test
    void getProfileReturnsTheCurrentRow() {
        CompanyProfile stored = blankProfile();
        stored.setDisplayName("Plotchain Estates");
        when(companyProfileRepository.findAll()).thenReturn(List.of(stored));

        CompanyProfileResponse response = companyProfileService.getProfile();

        assertThat(response.displayName()).isEqualTo("Plotchain Estates");
    }

    @Test
    void updateProfileSavesAllFieldsAndReturnsThem() {
        CompanyProfile stored = blankProfile();
        when(companyProfileRepository.findAll()).thenReturn(List.of(stored));

        CompanyProfileResponse response = companyProfileService.updateProfile(filledRequest(), ACTOR_ID);

        ArgumentCaptor<CompanyProfile> captor = ArgumentCaptor.forClass(CompanyProfile.class);
        verify(companyProfileRepository).save(captor.capture());
        CompanyProfile saved = captor.getValue();
        assertThat(saved.getDisplayName()).isEqualTo("Plotchain Estates");
        assertThat(saved.getLegalName()).isEqualTo("Plotchain Estates Private Limited");
        assertThat(saved.getRegistrationNumber()).isEqualTo("22AAAAA0000A1Z5");
        assertThat(saved.getContactName()).isEqualTo("Jane Doe");
        assertThat(saved.getContactPhone()).isEqualTo("+919876543210");
        assertThat(saved.getContactEmail()).isEqualTo("jane@plotchain.test");
        assertThat(saved.getRegisteredAddress()).isEqualTo("123 MG Road, Bengaluru");
        assertThat(saved.getUpdatedAt()).isNotNull();
        assertThat(response.displayName()).isEqualTo("Plotchain Estates");
        assertThat(response.registeredAddress()).isEqualTo("123 MG Road, Bengaluru");
    }

    @Test
    void updateProfileRecordsAnAuditEntryWithBeforeAndAfterSnapshots() {
        CompanyProfile stored = blankProfile();
        stored.setDisplayName("Old Name");
        when(companyProfileRepository.findAll()).thenReturn(List.of(stored));

        companyProfileService.updateProfile(filledRequest(), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("COMPANY_PROFILE");
        assertThat(saved.getSummary()).isEqualTo("Updated company profile");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        // Before-snapshot must reflect the row as it was prior to mutation, not a second
        // copy of the after-state -- this is the specific regression this test guards against.
        assertThat(saved.getDetail()).contains("\"before\":{\"displayName\":\"Old Name\"")
            .contains("\"after\":{\"displayName\":\"Plotchain Estates\"");
    }

    @Test
    void isCompleteIsFalseWhenAllFieldsAreBlank() {
        when(companyProfileRepository.findAll()).thenReturn(List.of(blankProfile()));

        assertThat(companyProfileService.isComplete()).isFalse();
    }

    @Test
    void isCompleteIsFalseWhenOneRequiredFieldIsMissing() {
        CompanyProfile stored = blankProfile();
        stored.setDisplayName("Plotchain Estates");
        stored.setLegalName("Plotchain Estates Private Limited");
        stored.setContactName("Jane Doe");
        stored.setContactPhone("+919876543210");
        stored.setContactEmail("jane@plotchain.test");
        // registeredAddress deliberately left blank
        when(companyProfileRepository.findAll()).thenReturn(List.of(stored));

        assertThat(companyProfileService.isComplete()).isFalse();
    }

    @Test
    void isCompleteIsTrueWhenAllRequiredFieldsAreFilled() {
        CompanyProfile stored = blankProfile();
        stored.setDisplayName("Plotchain Estates");
        stored.setLegalName("Plotchain Estates Private Limited");
        stored.setContactName("Jane Doe");
        stored.setContactPhone("+919876543210");
        stored.setContactEmail("jane@plotchain.test");
        stored.setRegisteredAddress("123 MG Road, Bengaluru");
        // registrationNumber stays null -- optional field, must not affect completeness
        when(companyProfileRepository.findAll()).thenReturn(List.of(stored));

        assertThat(companyProfileService.isComplete()).isTrue();
    }
}
