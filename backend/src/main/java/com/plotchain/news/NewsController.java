package com.plotchain.news;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/news")
@PreAuthorize("hasAuthority('ADMIN')")
public class NewsController {

    private final NewsService service;

    public NewsController(NewsService service) {
        this.service = service;
    }

    @GetMapping
    public List<NewsResponse> list() {
        return service.list();
    }

    @PostMapping
    public ResponseEntity<NewsResponse> create(@Valid @RequestBody NewsRequest request,
                                               @AuthenticationPrincipal UUID actorId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request, actorId));
    }
}
