package com.plotchain.epin;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/epins")
public class EPinController {

    private final EPinService epinService;

    public EPinController(EPinService epinService) {
        this.epinService = epinService;
    }

    @PostMapping
    public ResponseEntity<EPinBatchResponse> generateBatch(
            @Valid @RequestBody CreateEPinBatchRequest request,
            @AuthenticationPrincipal UUID actorId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(epinService.generateBatch(request, actorId));
    }
}
