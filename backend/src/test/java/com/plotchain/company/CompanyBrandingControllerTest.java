package com.plotchain.company;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockBean on the repository INTERFACES so this runs real CompanyBrandingService/
// CompanyProfileService inside a real Spring Security filter chain, per
// CompanyProfileControllerTest's pattern. Both now depend on the real SettingsAuditService
// bean, so its own repository dependencies (SettingsAuditLogRepository, AssociateRepository)
// need mocking too -- per SettingsAuditControllerTest's pattern.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CompanyBrandingControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean CompanyBrandingRepository companyBrandingRepository;
    @MockBean CompanyProfileRepository companyProfileRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;
    @MockBean AssociateRepository associateRepository;

    private String tokenFor(AssociateRole role) {
        Associate token = new Associate();
        token.setId(UUID.randomUUID());
        token.setRole(role);
        return jwtService.generateToken(token);
    }

    private CompanyBranding blankBranding() {
        CompanyBranding branding = new CompanyBranding();
        branding.setPrimaryColor("#7C3AED");
        branding.setSecondaryColor("#22D3EE");
        return branding;
    }

    @Test
    void getBrandingReturnsTheStoredBrandingForAnAdminToken() throws Exception {
        when(companyBrandingRepository.findAll()).thenReturn(List.of(blankBranding()));

        mockMvc.perform(get("/api/company/branding")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.primaryColor").value("#7C3AED"));
    }

    @Test
    void getBrandingIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/branding")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void putBrandingSavesAndReturnsTheUpdatedBranding() throws Exception {
        CompanyBranding stored = blankBranding();
        when(companyBrandingRepository.findAll()).thenReturn(List.of(stored));
        when(companyBrandingRepository.save(any())).thenReturn(stored);

        mockMvc.perform(put("/api/company/branding")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"primaryColor\":\"#E11D48\",\"secondaryColor\":\"#F59E0B\",\"tagline\":\"Land you can trust\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.primaryColor").value("#E11D48"))
            .andExpect(jsonPath("$.tagline").value("Land you can trust"));
    }

    @Test
    void putBrandingReturnsFieldErrorForNonHexColor() throws Exception {
        when(companyBrandingRepository.findAll()).thenReturn(List.of(blankBranding()));

        mockMvc.perform(put("/api/company/branding")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"primaryColor\":\"purple\",\"secondaryColor\":\"#F59E0B\",\"tagline\":\"\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("validation failed"))
            .andExpect(jsonPath("$.fields.primaryColor").isNotEmpty());
    }

    @Test
    void publicBrandingIsReachableWithoutAnyToken() throws Exception {
        when(companyBrandingRepository.findAll()).thenReturn(List.of(blankBranding()));
        CompanyProfile profile = new CompanyProfile();
        profile.setDisplayName("Plotchain Estates");
        when(companyProfileRepository.findAll()).thenReturn(List.of(profile));

        mockMvc.perform(get("/api/company/branding/public"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.displayName").value("Plotchain Estates"))
            .andExpect(jsonPath("$.primaryColor").value("#7C3AED"));
    }

    @Test
    void getLogoReturns404WhenNoneStored() throws Exception {
        when(companyBrandingRepository.findAll()).thenReturn(List.of(blankBranding()));

        mockMvc.perform(get("/api/company/branding/logo/square"))
            .andExpect(status().isNotFound());
    }

    @Test
    void getLogoReturnsBytesWithContentTypeAndCacheControlWhenStored() throws Exception {
        CompanyBranding stored = blankBranding();
        stored.setLogoSquare(new byte[]{1, 2, 3});
        stored.setLogoSquareContentType("image/png");
        when(companyBrandingRepository.findAll()).thenReturn(List.of(stored));

        mockMvc.perform(get("/api/company/branding/logo/square"))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Type", "image/png"))
            .andExpect(header().exists("Cache-Control"));
    }

    @Test
    void faviconReturns404WhenNoSquareLogoStored() throws Exception {
        when(companyBrandingRepository.findAll()).thenReturn(List.of(blankBranding()));

        mockMvc.perform(get("/api/company/branding/favicon"))
            .andExpect(status().isNotFound());
    }

    @Test
    void uploadLogoSavesBytesAndContentType() throws Exception {
        CompanyBranding stored = blankBranding();
        when(companyBrandingRepository.findAll()).thenReturn(List.of(stored));
        MockMultipartFile file = new MockMultipartFile("file", "logo.png", "image/png", new byte[]{1, 2, 3});

        mockMvc.perform(multipart("/api/company/branding/logo/square")
                .file(file)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isNoContent());

        verify(companyBrandingRepository).save(stored);
        assertThat(stored.getLogoSquareContentType()).isEqualTo("image/png");
        assertThat(stored.getLogoSquare()).containsExactly(1, 2, 3);
    }

    @Test
    void uploadLogoRejectsUnsupportedContentType() throws Exception {
        when(companyBrandingRepository.findAll()).thenReturn(List.of(blankBranding()));
        MockMultipartFile file = new MockMultipartFile("file", "logo.gif", "image/gif", new byte[]{1});

        mockMvc.perform(multipart("/api/company/branding/logo/square")
                .file(file)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    void uploadLogoIsForbiddenForAnAssociateToken() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "logo.png", "image/png", new byte[]{1});

        mockMvc.perform(multipart("/api/company/branding/logo/square")
                .file(file)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void invalidVariantIsNotFound() throws Exception {
        mockMvc.perform(get("/api/company/branding/logo/tall")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isNotFound());
    }
}
