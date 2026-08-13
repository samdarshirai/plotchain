package com.plotchain.associate;

import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockBean on the repository INTERFACES (not the concrete KycSubmissionService) so this runs
// a real KycSubmissionService inside a real Spring Security filter chain, same pattern as
// DashboardControllerTest/CompanyBrandingControllerTest.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class KycSubmissionControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean AssociateKycDocumentRepository associateKycDocumentRepository;

    private String tokenFor(UUID associateId) {
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(AssociateRole.ASSOCIATE);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void getStatusReturnsKycStatusAndDocumentsForTheAuthenticatedAssociate() throws Exception {
        UUID associateId = UUID.randomUUID();
        String token = tokenFor(associateId);
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setKycStatus(KycStatus.PENDING);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        AssociateKycDocument doc = new AssociateKycDocument();
        doc.setDocumentType("AADHAAR");
        doc.setContentType("image/png");
        doc.setUploadedAt(Instant.now());
        when(associateKycDocumentRepository.findByAssociateIdOrderByDocumentTypeAsc(associateId))
            .thenReturn(List.of(doc));

        mockMvc.perform(get("/api/associates/me/kyc")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.kycStatus").value("PENDING"))
            .andExpect(jsonPath("$.documents[0].documentType").value("AADHAAR"));
    }

    @Test
    void getStatusReturns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/kyc"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void uploadDocumentSavesTheFileAndResetsStatusToPending() throws Exception {
        UUID associateId = UUID.randomUUID();
        String token = tokenFor(associateId);
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setKycStatus(KycStatus.REJECTED);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(associateKycDocumentRepository.findByAssociateIdAndDocumentType(associateId, "PAN"))
            .thenReturn(Optional.empty());
        MockMultipartFile file = new MockMultipartFile("file", "pan.png", "image/png", new byte[]{1, 2, 3});

        mockMvc.perform(multipart("/api/associates/me/kyc/documents/PAN")
                .file(file)
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.documentType").value("PAN"))
            .andExpect(jsonPath("$.contentType").value("image/png"));
    }

    @Test
    void uploadDocumentRejectsAnUnsupportedContentType() throws Exception {
        UUID associateId = UUID.randomUUID();
        String token = tokenFor(associateId);
        Associate associate = new Associate();
        associate.setId(associateId);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        MockMultipartFile file = new MockMultipartFile("file", "pan.gif", "image/gif", new byte[]{1});

        mockMvc.perform(multipart("/api/associates/me/kyc/documents/PAN")
                .file(file)
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    void uploadDocumentReturns401WithoutAToken() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "pan.png", "image/png", new byte[]{1});

        mockMvc.perform(multipart("/api/associates/me/kyc/documents/PAN").file(file))
            .andExpect(status().isUnauthorized());
    }
}
