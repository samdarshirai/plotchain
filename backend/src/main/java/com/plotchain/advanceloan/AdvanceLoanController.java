package com.plotchain.advanceloan;

import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasAuthority('ADMIN')")
public class AdvanceLoanController {

    private final AdvanceLoanService service;

    public AdvanceLoanController(AdvanceLoanService service) {
        this.service = service;
    }

    @PostMapping("/advance-loans")
    public ResponseEntity<AdvanceLoanResponse> create(@Valid @RequestBody AdvanceLoanRequest request,
                                                      @AuthenticationPrincipal UUID actorId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request, actorId));
    }

    @GetMapping("/advance-loans")
    public List<AdvanceLoanResponse> list(@RequestParam(required = false) UUID associateId,
                                          @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                          @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.list(associateId, from, to);
    }

    @GetMapping("/advance-loans/dues")
    public LoanDuesResponse dues(@RequestParam UUID associateId) {
        return service.dues(associateId);
    }

    @PostMapping("/advance-loans/{id}/repayments")
    public ResponseEntity<LoanRepaymentResponse> repay(@PathVariable UUID id, @Valid @RequestBody RepaymentRequest request,
                                                       @AuthenticationPrincipal UUID actorId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.repay(id, request, actorId));
    }

    @GetMapping("/loan-repayments")
    public List<LoanRepaymentResponse> repayments(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String q) {
        return service.repayments(from, to, q);
    }

    @GetMapping("/loan-repayments/{id}")
    public LoanRepaymentResponse repayment(@PathVariable UUID id) {
        return service.repayment(id);
    }
}
