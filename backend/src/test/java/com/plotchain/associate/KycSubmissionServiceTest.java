package com.plotchain.associate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class KycSubmissionServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock AssociateKycDocumentRepository associateKycDocumentRepository;

    KycSubmissionService service;
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new KycSubmissionService(associateRepository, associateKycDocumentRepository);
    }

    private Associate pendingAssociate() {
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setRole(AssociateRole.ASSOCIATE);
        a.setKycStatus(KycStatus.PENDING);
        return a;
    }

    @Test
    void uploadDocumentCreatesANewRowAndResetsStatusToPending() {
        Associate associate = pendingAssociate();
        associate.setKycStatus(KycStatus.REJECTED);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));
        when(associateKycDocumentRepository.findByAssociateIdAndDocumentType(ASSOCIATE_ID, "AADHAAR"))
            .thenReturn(Optional.empty());
        MockMultipartFile file = new MockMultipartFile("file", "aadhaar.png", "image/png", new byte[]{1, 2, 3});

        KycDocumentSummary summary = service.uploadDocument(ASSOCIATE_ID, "AADHAAR", file);

        assertThat(summary.documentType()).isEqualTo("AADHAAR");
        assertThat(summary.contentType()).isEqualTo("image/png");
        assertThat(associate.getKycStatus()).isEqualTo(KycStatus.PENDING);
        verify(associateRepository).save(associate);

        ArgumentCaptor<AssociateKycDocument> captor = ArgumentCaptor.forClass(AssociateKycDocument.class);
        verify(associateKycDocumentRepository).save(captor.capture());
        assertThat(captor.getValue().getAssociateId()).isEqualTo(ASSOCIATE_ID);
        assertThat(captor.getValue().getDocumentType()).isEqualTo("AADHAAR");
        assertThat(captor.getValue().getContent()).containsExactly(1, 2, 3);
        assertThat(captor.getValue().getId()).isNotNull();
    }

    @Test
    void uploadDocumentOverwritesAnExistingRowForTheSameType() {
        Associate associate = pendingAssociate();
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));
        UUID existingId = UUID.randomUUID();
        AssociateKycDocument existing = new AssociateKycDocument();
        existing.setId(existingId);
        existing.setAssociateId(ASSOCIATE_ID);
        existing.setDocumentType("PAN");
        existing.setContent(new byte[]{9});
        existing.setContentType("image/jpeg");
        existing.setUploadedAt(Instant.now().minusSeconds(3600));
        when(associateKycDocumentRepository.findByAssociateIdAndDocumentType(ASSOCIATE_ID, "PAN"))
            .thenReturn(Optional.of(existing));
        MockMultipartFile file = new MockMultipartFile("file", "pan.pdf", "application/pdf", new byte[]{7, 7});

        service.uploadDocument(ASSOCIATE_ID, "PAN", file);

        ArgumentCaptor<AssociateKycDocument> captor = ArgumentCaptor.forClass(AssociateKycDocument.class);
        verify(associateKycDocumentRepository).save(captor.capture());
        // Same row (same id), new bytes/contentType -- overwrite, not a second row.
        assertThat(captor.getValue().getId()).isEqualTo(existingId);
        assertThat(captor.getValue().getContent()).containsExactly(7, 7);
        assertThat(captor.getValue().getContentType()).isEqualTo("application/pdf");
    }

    @Test
    void uploadDocumentResetsAnAlreadyVerifiedStatusBackToPending() {
        Associate associate = pendingAssociate();
        associate.setKycStatus(KycStatus.VERIFIED);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));
        when(associateKycDocumentRepository.findByAssociateIdAndDocumentType(any(), any())).thenReturn(Optional.empty());
        MockMultipartFile file = new MockMultipartFile("file", "pan.png", "image/png", new byte[]{1});

        service.uploadDocument(ASSOCIATE_ID, "PAN", file);

        assertThat(associate.getKycStatus()).isEqualTo(KycStatus.PENDING);
    }

    @Test
    void uploadDocumentRejectsAnEmptyFile() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(pendingAssociate()));
        MockMultipartFile empty = new MockMultipartFile("file", "aadhaar.png", "image/png", new byte[0]);

        assertThatThrownBy(() -> service.uploadDocument(ASSOCIATE_ID, "AADHAAR", empty))
            .isInstanceOf(InvalidKycUploadException.class);
        verify(associateKycDocumentRepository, never()).save(any());
    }

    @Test
    void uploadDocumentRejectsAnUnsupportedContentType() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(pendingAssociate()));
        MockMultipartFile gif = new MockMultipartFile("file", "aadhaar.gif", "image/gif", new byte[]{1});

        assertThatThrownBy(() -> service.uploadDocument(ASSOCIATE_ID, "AADHAAR", gif))
            .isInstanceOf(InvalidKycUploadException.class);
    }

    @Test
    void uploadDocumentRejectsABlankDocumentType() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(pendingAssociate()));
        MockMultipartFile file = new MockMultipartFile("file", "aadhaar.png", "image/png", new byte[]{1});

        assertThatThrownBy(() -> service.uploadDocument(ASSOCIATE_ID, "  ", file))
            .isInstanceOf(InvalidKycUploadException.class);
    }

    @Test
    void uploadDocumentThrowsWhenAssociateNotFound() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());
        MockMultipartFile file = new MockMultipartFile("file", "aadhaar.png", "image/png", new byte[]{1});

        assertThatThrownBy(() -> service.uploadDocument(ASSOCIATE_ID, "AADHAAR", file))
            .isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void getStatusReturnsKycStatusAndSubmittedDocuments() {
        Associate associate = pendingAssociate();
        associate.setKycStatus(KycStatus.VERIFIED);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));
        AssociateKycDocument doc = new AssociateKycDocument();
        doc.setId(UUID.randomUUID());
        doc.setAssociateId(ASSOCIATE_ID);
        doc.setDocumentType("AADHAAR");
        doc.setContentType("image/png");
        doc.setUploadedAt(Instant.now());
        when(associateKycDocumentRepository.findByAssociateIdOrderByDocumentTypeAsc(ASSOCIATE_ID))
            .thenReturn(List.of(doc));

        AssociateKycStatusResponse response = service.getStatus(ASSOCIATE_ID);

        assertThat(response.kycStatus()).isEqualTo(KycStatus.VERIFIED);
        assertThat(response.documents()).hasSize(1);
        assertThat(response.documents().get(0).documentType()).isEqualTo("AADHAAR");
    }

    @Test
    void getStatusThrowsWhenAssociateNotFound() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getStatus(ASSOCIATE_ID))
            .isInstanceOf(AssociateNotFoundException.class);
    }
}
