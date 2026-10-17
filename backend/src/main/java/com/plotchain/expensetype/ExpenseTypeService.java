package com.plotchain.expensetype;

import com.plotchain.company.SettingsAuditService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ExpenseTypeService {

    private static final String AUDIT_SECTION = "EXPENSE_TYPES";

    private final ExpenseTypeRepository repository;
    private final SettingsAuditService auditService;

    public ExpenseTypeService(ExpenseTypeRepository repository, SettingsAuditService auditService) {
        this.repository = repository;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public List<ExpenseTypeResponse> list() {
        return repository.findAllByOrderByCreatedAtAsc().stream().map(ExpenseTypeResponse::of).toList();
    }

    @Transactional
    public ExpenseTypeResponse create(ExpenseTypeRequest request, UUID actorId) {
        String name = request.name().trim();
        if (repository.existsByNameIgnoreCase(name)) {
            throw new ExpenseTypeException(HttpStatus.CONFLICT, "Expense type already exists: " + name);
        }
        ExpenseType type = new ExpenseType(UUID.randomUUID());
        type.setName(name);
        if (request.status() != null) type.setStatus(request.status());
        repository.save(type);
        auditService.record(AUDIT_SECTION, "Created expense type " + name, Map.of("id", type.getId().toString()), actorId);
        return ExpenseTypeResponse.of(type);
    }

    @Transactional
    public ExpenseTypeResponse update(UUID id, ExpenseTypeRequest request, UUID actorId) {
        ExpenseType type = repository.findById(id)
            .orElseThrow(() -> new ExpenseTypeException(HttpStatus.NOT_FOUND, "Expense type not found: " + id));
        String name = request.name().trim();
        if (repository.existsByNameIgnoreCaseAndIdNot(name, id)) {
            throw new ExpenseTypeException(HttpStatus.CONFLICT, "Expense type already exists: " + name);
        }
        type.setName(name);
        if (request.status() != null) type.setStatus(request.status());
        type.touch();
        repository.save(type);
        auditService.record(AUDIT_SECTION, "Updated expense type " + name,
            Map.of("id", id.toString(), "status", type.getStatus().name()), actorId);
        return ExpenseTypeResponse.of(type);
    }
}
