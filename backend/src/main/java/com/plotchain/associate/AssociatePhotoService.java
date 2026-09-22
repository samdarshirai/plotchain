package com.plotchain.associate;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

// Self-scoped by construction: every method takes the caller's own associateId, sourced by
// AssociatePhotoController from @AuthenticationPrincipal -- same pattern as KycSubmissionService.
@Service
public class AssociatePhotoService {

    // No PDF (unlike KycSubmissionService's allowlist) -- this is a photo, same allowlist as
    // company.CompanyBrandingService's logo upload minus svg (a profile photo is a raster image,
    // not a vector logo).
    private static final Set<String> ALLOWED_PHOTO_CONTENT_TYPES =
        Set.of("image/png", "image/jpeg", "image/webp");

    private final AssociateRepository associateRepository;
    private final AssociatePhotoRepository associatePhotoRepository;

    public AssociatePhotoService(AssociateRepository associateRepository,
                                  AssociatePhotoRepository associatePhotoRepository) {
        this.associateRepository = associateRepository;
        this.associatePhotoRepository = associatePhotoRepository;
    }

    @Transactional
    public void uploadPhoto(UUID associateId, MultipartFile file) {
        associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));

        if (file == null || file.isEmpty()) {
            throw new InvalidPhotoUploadException("photo file is empty");
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_PHOTO_CONTENT_TYPES.contains(contentType)) {
            throw new InvalidPhotoUploadException("unsupported photo content type: " + contentType);
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }

        AssociatePhoto photo = associatePhotoRepository.findByAssociateId(associateId)
            .orElseGet(() -> {
                AssociatePhoto p = new AssociatePhoto();
                p.setId(UUID.randomUUID());
                p.setAssociateId(associateId);
                return p;
            });
        photo.setContent(bytes);
        photo.setContentType(contentType);
        photo.setUpdatedAt(Instant.now());
        associatePhotoRepository.save(photo);
    }

    public Optional<PhotoBytes> getPhoto(UUID associateId) {
        return associatePhotoRepository.findByAssociateId(associateId)
            .map(p -> new PhotoBytes(p.getContent(), p.getContentType()));
    }

    @Transactional
    public void removePhoto(UUID associateId) {
        associatePhotoRepository.deleteByAssociateId(associateId);
    }
}
