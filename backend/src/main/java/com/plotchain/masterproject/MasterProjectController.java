package com.plotchain.masterproject;

import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/master-projects")
@PreAuthorize("hasAuthority('ADMIN')")
public class MasterProjectController {

    private final MasterProjectService service;

    public MasterProjectController(MasterProjectService service) {
        this.service = service;
    }

    @GetMapping
    public List<MasterProjectResponse> list() {
        return service.list();
    }

    @PostMapping
    public ResponseEntity<MasterProjectResponse> create(@Valid @RequestBody MasterProjectRequest request,
                                                        @AuthenticationPrincipal UUID actorId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request, actorId));
    }

    @PutMapping("/{id}")
    public MasterProjectResponse update(@PathVariable UUID id, @Valid @RequestBody MasterProjectRequest request,
                                        @AuthenticationPrincipal UUID actorId) {
        return service.update(id, request, actorId);
    }

    @PostMapping("/{id}/maps/{kind}")
    public ResponseEntity<Void> uploadMap(@PathVariable UUID id, @PathVariable MasterProjectService.MapKind kind,
                                          @RequestParam("file") MultipartFile file,
                                          @AuthenticationPrincipal UUID actorId) {
        service.uploadMap(id, kind, file, actorId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/maps/{kind}")
    public ResponseEntity<byte[]> getMap(@PathVariable UUID id, @PathVariable MasterProjectService.MapKind kind) {
        return service.getMap(id, kind)
            .map(m -> ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(m.contentType()))
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePrivate())
                .body(m.data()))
            .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
