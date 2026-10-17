package com.plotchain.expensetype;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/expense-types")
@PreAuthorize("hasAuthority('ADMIN')")
public class ExpenseTypeController {

    private final ExpenseTypeService service;

    public ExpenseTypeController(ExpenseTypeService service) {
        this.service = service;
    }

    @GetMapping
    public List<ExpenseTypeResponse> list() {
        return service.list();
    }

    @PostMapping
    public ResponseEntity<ExpenseTypeResponse> create(@Valid @RequestBody ExpenseTypeRequest request,
                                                      @AuthenticationPrincipal UUID actorId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request, actorId));
    }

    @PutMapping("/{id}")
    public ExpenseTypeResponse update(@PathVariable UUID id, @Valid @RequestBody ExpenseTypeRequest request,
                                      @AuthenticationPrincipal UUID actorId) {
        return service.update(id, request, actorId);
    }
}
