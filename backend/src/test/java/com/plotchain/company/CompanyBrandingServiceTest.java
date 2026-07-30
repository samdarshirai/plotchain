package com.plotchain.company;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.AssociateRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CompanyBrandingServiceTest {

    @Mock CompanyBrandingRepository companyBrandingRepository;
    // CompanyProfileService is a concrete class -- built for real over a mocked repository,
    // per the repo's established pattern (see SetupStateServiceTest).
    @Mock CompanyProfileRepository companyProfileRepository;
    // SettingsAuditService is also a concrete class -- this JDK's Mockito/ByteBuddy can't
    // instrument concrete classes (see AuthControllerTest), so a real instance is built over
    // mocked (interface) repositories instead. Audit calls are asserted via the
    // settingsAuditLogRepository.save(...) captor, same as SettingsAuditServiceTest.
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;
    @Mock AssociateRepository associateRepository;

    CompanyBrandingService companyBrandingService;

    private static final UUID ACTOR_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        companyBrandingService = new CompanyBrandingService(
            companyBrandingRepository,
            new CompanyProfileService(companyProfileRepository, settingsAuditService),
            settingsAuditService);
    }

    private CompanyBranding blankBranding() {
        CompanyBranding branding = new CompanyBranding();
        branding.setPrimaryColor("#7C3AED");
        branding.setSecondaryColor("#22D3EE");
        return branding;
    }

    private void stubBranding(CompanyBranding branding) {
        when(companyBrandingRepository.findAll()).thenReturn(List.of(branding));
    }

    private void stubProfile(String displayName) {
        CompanyProfile profile = new CompanyProfile();
        profile.setDisplayName(displayName);
        when(companyProfileRepository.findAll()).thenReturn(List.of(profile));
    }

    @Test
    void getBrandingReturnsTheCurrentRow() {
        CompanyBranding stored = blankBranding();
        stubBranding(stored);

        CompanyBrandingResponse response = companyBrandingService.getBranding();

        assertThat(response.primaryColor()).isEqualTo("#7C3AED");
        assertThat(response.secondaryColor()).isEqualTo("#22D3EE");
        assertThat(response.hasSquareLogo()).isFalse();
        assertThat(response.hasWideLogo()).isFalse();
    }

    @Test
    void updateBrandingSavesColorsAndTaglineAndReturnsThem() {
        stubBranding(blankBranding());

        CompanyBrandingResponse response = companyBrandingService.updateBranding(
            new CompanyBrandingRequest("#E11D48", "#F59E0B", "Land you can trust"), ACTOR_ID);

        ArgumentCaptor<CompanyBranding> captor = ArgumentCaptor.forClass(CompanyBranding.class);
        verify(companyBrandingRepository).save(captor.capture());
        CompanyBranding saved = captor.getValue();
        assertThat(saved.getPrimaryColor()).isEqualTo("#E11D48");
        assertThat(saved.getSecondaryColor()).isEqualTo("#F59E0B");
        assertThat(saved.getTagline()).isEqualTo("Land you can trust");
        assertThat(saved.getUpdatedAt()).isNotNull();
        assertThat(response.primaryColor()).isEqualTo("#E11D48");
    }

    @Test
    void updateBrandingRecordsAnAuditEntry() {
        stubBranding(blankBranding());

        companyBrandingService.updateBranding(
            new CompanyBrandingRequest("#E11D48", "#F59E0B", "Land you can trust"), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("BRANDING");
        assertThat(saved.getSummary()).isEqualTo("Updated branding");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(saved.getDetail()).contains("\"primaryColor\":\"#7C3AED\"")
            .contains("\"primaryColor\":\"#E11D48\"");
    }

    @Test
    void uploadLogoStoresSquareBytesAndContentTypeWithoutTouchingWide() {
        CompanyBranding stored = blankBranding();
        stubBranding(stored);
        MockMultipartFile file = new MockMultipartFile("file", "logo.png", "image/png", new byte[]{1, 2, 3});

        companyBrandingService.uploadLogo("square", file, ACTOR_ID);

        ArgumentCaptor<CompanyBranding> captor = ArgumentCaptor.forClass(CompanyBranding.class);
        verify(companyBrandingRepository).save(captor.capture());
        CompanyBranding saved = captor.getValue();
        assertThat(saved.getLogoSquare()).containsExactly(1, 2, 3);
        assertThat(saved.getLogoSquareContentType()).isEqualTo("image/png");
        assertThat(saved.getLogoWide()).isNull();
    }

    @Test
    void uploadLogoStoresWideBytesAndContentTypeWithoutTouchingSquare() {
        CompanyBranding stored = blankBranding();
        stubBranding(stored);
        MockMultipartFile file = new MockMultipartFile("file", "banner.webp", "image/webp", new byte[]{4, 5});

        companyBrandingService.uploadLogo("wide", file, ACTOR_ID);

        ArgumentCaptor<CompanyBranding> captor = ArgumentCaptor.forClass(CompanyBranding.class);
        verify(companyBrandingRepository).save(captor.capture());
        CompanyBranding saved = captor.getValue();
        assertThat(saved.getLogoWide()).containsExactly(4, 5);
        assertThat(saved.getLogoWideContentType()).isEqualTo("image/webp");
        assertThat(saved.getLogoSquare()).isNull();
    }

    @Test
    void uploadLogoRecordsAnAuditEntryWithTheVariantName() {
        CompanyBranding stored = blankBranding();
        stubBranding(stored);
        MockMultipartFile file = new MockMultipartFile("file", "logo.png", "image/png", new byte[]{1, 2, 3});

        companyBrandingService.uploadLogo("square", file, ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("BRANDING");
        assertThat(saved.getSummary()).isEqualTo("Uploaded square logo");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(saved.getDetail()).contains("\"variant\":\"square\"").contains("\"contentType\":\"image/png\"");
    }

    @Test
    void uploadLogoThrowsForAnEmptyFile() {
        MockMultipartFile empty = new MockMultipartFile("file", "logo.png", "image/png", new byte[0]);

        assertThatThrownBy(() -> companyBrandingService.uploadLogo("square", empty, ACTOR_ID))
            .isInstanceOf(InvalidLogoUploadException.class);
    }

    @Test
    void uploadLogoThrowsForAnUnsupportedContentType() {
        MockMultipartFile gif = new MockMultipartFile("file", "logo.gif", "image/gif", new byte[]{1});

        assertThatThrownBy(() -> companyBrandingService.uploadLogo("square", gif, ACTOR_ID))
            .isInstanceOf(InvalidLogoUploadException.class);
    }

    @Test
    void getLogoReturnsEmptyWhenNoneStored() {
        stubBranding(blankBranding());

        assertThat(companyBrandingService.getLogo("square")).isEmpty();
    }

    @Test
    void getLogoReturnsBytesWhenStored() {
        CompanyBranding stored = blankBranding();
        stored.setLogoSquare(new byte[]{9});
        stored.setLogoSquareContentType("image/png");
        stubBranding(stored);

        Optional<LogoBytes> logo = companyBrandingService.getLogo("square");

        assertThat(logo).isPresent();
        assertThat(logo.get().data()).containsExactly(9);
        assertThat(logo.get().contentType()).isEqualTo("image/png");
    }

    @Test
    void getPublicBrandingComposesDisplayNameFromCompanyProfile() {
        CompanyBranding stored = blankBranding();
        stored.setTagline("Land you can trust");
        stubBranding(stored);
        stubProfile("Plotchain Estates");

        CompanyBrandingPublicResponse response = companyBrandingService.getPublicBranding();

        assertThat(response.displayName()).isEqualTo("Plotchain Estates");
        assertThat(response.tagline()).isEqualTo("Land you can trust");
        assertThat(response.primaryColor()).isEqualTo("#7C3AED");
    }

    @Test
    void isCompleteIsFalseWithoutLogoOrTagline() {
        stubBranding(blankBranding());

        assertThat(companyBrandingService.isComplete()).isFalse();
    }

    @Test
    void isCompleteIsFalseWithLogoButNoTagline() {
        CompanyBranding stored = blankBranding();
        stored.setLogoSquare(new byte[]{1});
        stubBranding(stored);

        assertThat(companyBrandingService.isComplete()).isFalse();
    }

    @Test
    void isCompleteIsTrueWithLogoAndTagline() {
        CompanyBranding stored = blankBranding();
        stored.setLogoSquare(new byte[]{1});
        stored.setTagline("Land you can trust");
        stubBranding(stored);

        assertThat(companyBrandingService.isComplete()).isTrue();
    }
}
