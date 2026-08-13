package com.plotchain.associate;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class KycSubmissionService {

    // ID-document scans are commonly PDF, unlike CompanyBrandingService's logo-only allowlist
    // (image/png, image/jpeg, image/svg+xml, image/webp) -- this is its own constant, not a
    // shared one, since the two upload flows accept genuinely different file kinds.
    private static final Set<String> ALLOWED_KYC_CONTENT_TYPES =
        Set.of("image/png", "image/jpeg", "image/webp", "application/pdf");

    private static final int MAX_DOCUMENT_TYPE_LENGTH = 50;

    private final AssociateRepository associateRepository;
    private final AssociateKycDocumentRepository associateKycDocumentRepository;

    public KycSubmissionService(AssociateRepository associateRepository,
                                 AssociateKycDocumentRepository associateKycDocumentRepository) {
        this.associateRepository = associateRepository;
        this.associateKycDocumentRepository = associateKycDocumentRepository;
    }

    @Transactional
    public KycDocumentSummary uploadDocument(UUID associateId, String documentType, MultipartFile file) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));

        if (documentType == null || documentType.isBlank()) {
            throw new InvalidKycUploadException("documentType is required");
        }
        if (documentType.length() > MAX_DOCUMENT_TYPE_LENGTH) {
            throw new InvalidKycUploadException("documentType exceeds " + MAX_DOCUMENT_TYPE_LENGTH + " characters");
        }
        if (file == null || file.isEmpty()) {
            throw new InvalidKycUploadException("file is empty");
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_KYC_CONTENT_TYPES.contains(contentType)) {
            throw new InvalidKycUploadException("unsupported document content type: " + contentType);
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }

        AssociateKycDocument document = associateKycDocumentRepository
            .findByAssociateIdAndDocumentType(associateId, documentType)
            .orElseGet(() -> {
                AssociateKycDocument d = new AssociateKycDocument();
                d.setId(UUID.randomUUID());
                d.setAssociateId(associateId);
                d.setDocumentType(documentType);
                return d;
            });
        document.setContent(bytes);
        document.setContentType(contentType);
        document.setUploadedAt(Instant.now());
        associateKycDocumentRepository.save(document);

        // Every successful upload resets to PENDING regardless of prior status: first
        // submission (already PENDING -- harmless no-op save), resubmission after REJECTED
        // (puts the associate back in the admin review queue), or a new upload after VERIFIED
        // (new evidence shouldn't silently keep a stale "verified" status). One unconditional
        // assignment, not a per-prior-state branch.
        associate.setKycStatus(KycStatus.PENDING);
        associateRepository.save(associate);

        return toSummary(document);
    }

    public AssociateKycStatusResponse getStatus(UUID associateId) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        List<KycDocumentSummary> documents = associateKycDocumentRepository
            .findByAssociateIdOrderByDocumentTypeAsc(associateId).stream()
            .map(KycSubmissionService::toSummary)
            .toList();
        return new AssociateKycStatusResponse(associate.getKycStatus(), documents);
    }

    private static KycDocumentSummary toSummary(AssociateKycDocument d) {
        return new KycDocumentSummary(d.getDocumentType(), d.getContentType(), d.getUploadedAt());
    }
}
