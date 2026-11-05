package com.plotchain.cycle;

import com.plotchain.income.IncomeType;

import java.math.BigDecimal;

// Gross and net amounts are both retained so display and payout consumers can choose explicitly.
public record CycleIncomeTypeTotal(IncomeType incomeType, BigDecimal totalNet, BigDecimal totalGross) {}
