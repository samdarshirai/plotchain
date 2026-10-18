package com.plotchain.expense;

import com.plotchain.company.SettingsAuditService;
import com.plotchain.expensetype.ExpenseType;
import com.plotchain.expensetype.ExpenseTypeRepository;
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ExpenseService {

    private static final String AUDIT_SECTION = "EXPENSE";
    private static final LocalDate MIN_DATE = LocalDate.of(1970, 1, 1);
    private static final LocalDate MAX_DATE = LocalDate.of(9999, 12, 31);

    private final ExpenseRepository repository;
    private final ExpenseTypeRepository typeRepository;
    private final ProjectRepository projectRepository;
    private final SettingsAuditService auditService;

    public ExpenseService(ExpenseRepository repository, ExpenseTypeRepository typeRepository,
                          ProjectRepository projectRepository, SettingsAuditService auditService) {
        this.repository = repository;
        this.typeRepository = typeRepository;
        this.projectRepository = projectRepository;
        this.auditService = auditService;
    }

    @Transactional
    public ExpenseResponse create(ExpenseRequest r, UUID actorId) {
        requireTwoDecimals(r.amount());
        ExpenseType type = typeRepository.findById(r.expenseTypeId())
            .orElseThrow(() -> new ExpenseException(HttpStatus.NOT_FOUND, "Expense type not found: " + r.expenseTypeId()));
        if (type.getStatus() != ExpenseType.Status.ACTIVE) {
            throw new ExpenseException(HttpStatus.CONFLICT, "Expense type is inactive: " + type.getName());
        }
        Project project = null;
        if (r.projectId() != null) {
            project = projectRepository.findById(r.projectId())
                .orElseThrow(() -> new ExpenseException(HttpStatus.NOT_FOUND, "Project not found: " + r.projectId()));
        }
        Expense e = new Expense(UUID.randomUUID(), r.expenseDate(), type.getId(), r.projectId(), r.payTo().trim(),
            r.amount(), r.payMode(), blankToNull(r.bankName()), blankToNull(r.txnNo()), blankToNull(r.remarks()));
        repository.save(e);
        auditService.record(AUDIT_SECTION, "Recorded expense " + r.amount() + " to " + e.getPayTo(),
            Map.of("id", e.getId().toString(), "amount", r.amount().toPlainString()), actorId);
        return toResponse(e, type.getName(), project == null ? null : project.getName());
    }

    // ponytail: filters typeId/projectId applied in memory over a date-bounded list; push into the query if row counts grow.
    @Transactional(readOnly = true)
    public List<ExpenseResponse> list(LocalDate from, LocalDate to, UUID typeId, UUID projectId) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new ExpenseException(HttpStatus.BAD_REQUEST, "from must not be after to");
        }
        List<Expense> rows = repository.findByExpenseDateBetweenOrderByExpenseDateDescCreatedAtDesc(
                from == null ? MIN_DATE : from, to == null ? MAX_DATE : to).stream()
            .filter(e -> typeId == null || typeId.equals(e.getExpenseTypeId()))
            .filter(e -> projectId == null || projectId.equals(e.getProjectId()))
            .toList();
        Map<UUID, String> typeNames = typeRepository.findAllById(rows.stream().map(Expense::getExpenseTypeId).distinct().toList())
            .stream().collect(Collectors.toMap(ExpenseType::getId, ExpenseType::getName));
        Map<UUID, String> projectNames = projectRepository.findAllById(
                rows.stream().map(Expense::getProjectId).filter(java.util.Objects::nonNull).distinct().toList())
            .stream().collect(Collectors.toMap(Project::getId, Project::getName));
        return rows.stream().map(e -> toResponse(e, typeNames.get(e.getExpenseTypeId()), projectNames.get(e.getProjectId()))).toList();
    }

    private static ExpenseResponse toResponse(Expense e, String typeName, String projectName) {
        return new ExpenseResponse(e.getId(), e.getExpenseDate(), e.getExpenseTypeId(), typeName, e.getProjectId(),
            projectName, e.getPayTo(), e.getAmount(), e.getPayMode(), e.getBankName(), e.getTxnNo(), e.getRemarks());
    }

    static void requireTwoDecimals(BigDecimal amount) {
        if (amount.scale() > 2 && amount.stripTrailingZeros().scale() > 2) {
            throw new ExpenseException(HttpStatus.BAD_REQUEST, "Amount must have at most 2 decimal places");
        }
    }

    static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
