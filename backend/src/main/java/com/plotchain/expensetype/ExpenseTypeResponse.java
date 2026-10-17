package com.plotchain.expensetype;

import java.time.Instant;
import java.util.UUID;

public record ExpenseTypeResponse(UUID id, String name, ExpenseType.Status status, Instant createdAt) {
    static ExpenseTypeResponse of(ExpenseType e) {
        return new ExpenseTypeResponse(e.getId(), e.getName(), e.getStatus(), e.getCreatedAt());
    }
}
