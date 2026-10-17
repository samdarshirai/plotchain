package com.plotchain.expensetype;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ExpenseTypeRequest(
    @NotBlank @Size(max = 100) String name,
    ExpenseType.Status status
) {}
