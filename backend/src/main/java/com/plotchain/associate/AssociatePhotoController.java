package com.plotchain.associate;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

// Self-scoped by construction, same pattern as KycSubmissionController: the target associate
// always comes from the verified JWT (@AuthenticationPrincipal), never a path/query parameter.
// Byte-serving shape mirrors company.CompanyBrandingController.getLogo/toBytesResponse, but with
// no public cache-control -- this is a private per-associate image behind an authenticated GET,
// not a public company logo.
@RestController
@RequestMapping("/api/associates/me/photo")
public class AssociatePhotoController {

    private final AssociatePhotoService associatePhotoService;

    public AssociatePhotoController(AssociatePhotoService associatePhotoService) {
        this.associatePhotoService = associatePhotoService;
    }

    @PostMapping
    public ResponseEntity<Void> upload(
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal UUID associateId) {
        associatePhotoService.uploadPhoto(associateId, file);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    public ResponseEntity<byte[]> get(@AuthenticationPrincipal UUID associateId) {
        return associatePhotoService.getPhoto(associateId)
            .map(photo -> ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(photo.contentType()))
                .cacheControl(CacheControl.noStore())
                .body(photo.data()))
            .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping
    public ResponseEntity<Void> remove(@AuthenticationPrincipal UUID associateId) {
        associatePhotoService.removePhoto(associateId);
        return ResponseEntity.noContent().build();
    }
}
