package com.plotchain.cycle;

import com.plotchain.booking.BookingService;
import com.plotchain.cycle.CycleFinalReportResponse.NamedAmount;
import com.plotchain.expense.ExpenseRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

@Service
public class FinalReportService {

    private final CycleService cycleService;
    private final ExpenseRepository expenseRepository;

    public FinalReportService(CycleService cycleService, ExpenseRepository expenseRepository) {
        this.cycleService = cycleService;
        this.expenseRepository = expenseRepository;
    }

    // ponytail: no paging, one getDetail per cycle; add paging if cycles pass a few hundred.
    // cycleIds: null = all cycles, empty = none, unknown ids ignored. allCycles is always the full list.
    public FinalReportTableResponse getFinalReportTable(List<UUID> cycleIds) {
        List<CycleSummaryResponse> cycles = cycleService.list(null, 0, Integer.MAX_VALUE).cycles();
        List<CycleFinalReportResponse> raw = cycles.stream()
            .filter(c -> cycleIds == null || cycleIds.contains(c.id()))
            .map(c -> compute(c.id())).toList();

        // Alphabetical, from the DB: TreeSet over every name seen in any cycle.
        Set<String> expenseTypes = new TreeSet<>();
        Set<String> refundTypes = new TreeSet<>();
        raw.forEach(r -> {
            r.expenses().forEach(e -> expenseTypes.add(e.name()));
            r.refunds().forEach(e -> refundTypes.add(e.name()));
        });
        List<String> et = List.copyOf(expenseTypes);
        List<String> rt = List.copyOf(refundTypes);

        List<CycleFinalReportResponse> rows = raw.stream().map(r -> new CycleFinalReportResponse(
            r.cycleId(), r.periodStart(), r.periodEnd(), r.status(), r.totalBusiness(), r.netCommission(),
            r.incomeTypeTotals(), pad(et, r.expenses()), r.totalExpenses(), r.totalPayout(),
            r.payoutPercent(), pad(rt, r.refunds()), r.totalRefunds())).toList();

        BigDecimal business = rows.stream().map(CycleFinalReportResponse::totalBusiness).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal payout = rows.stream().map(CycleFinalReportResponse::totalPayout).reduce(BigDecimal.ZERO, BigDecimal::add);
        CycleFinalReportResponse total = new CycleFinalReportResponse(null, null, null, null,
            business,
            rows.stream().map(CycleFinalReportResponse::netCommission).reduce(BigDecimal.ZERO, BigDecimal::add),
            List.of(),
            et.stream().map(n -> new NamedAmount(n, columnSum(rows, n, false))).toList(),
            rows.stream().map(CycleFinalReportResponse::totalExpenses).reduce(BigDecimal.ZERO, BigDecimal::add),
            payout, percent(payout, business),
            rt.stream().map(n -> new NamedAmount(n, columnSum(rows, n, true))).toList(),
            rows.stream().map(CycleFinalReportResponse::totalRefunds).reduce(BigDecimal.ZERO, BigDecimal::add));
        List<FinalReportTableResponse.CycleOption> all = cycles.stream().map(c ->
            new FinalReportTableResponse.CycleOption(c.id(), c.periodStart(), c.periodEnd(), c.status())).toList();
        return new FinalReportTableResponse(et, rt, rows, total, all);
    }

    private static BigDecimal columnSum(List<CycleFinalReportResponse> rows, String name, boolean refund) {
        return rows.stream().flatMap(r -> (refund ? r.refunds() : r.expenses()).stream())
            .filter(a -> a.name().equals(name)).map(NamedAmount::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static List<NamedAmount> pad(List<String> names, List<NamedAmount> have) {
        return names.stream().map(n -> have.stream().filter(a -> a.name().equals(n)).findFirst()
            .orElse(new NamedAmount(n, BigDecimal.ZERO))).toList();
    }

    private static BigDecimal percent(BigDecimal payout, BigDecimal business) {
        return business.signum() == 0 ? BigDecimal.ZERO.setScale(2)
            : payout.multiply(BigDecimal.valueOf(100)).divide(business, 2, RoundingMode.HALF_UP);
    }

    private CycleFinalReportResponse compute(UUID cycleId) {

        CycleDetailResponse d = cycleService.getDetail(cycleId);
        LocalDate end = d.periodEnd() == null ? LocalDate.now() : d.periodEnd();

        List<NamedAmount> expenses = new ArrayList<>();
        List<NamedAmount> refunds = new ArrayList<>();
        for (var row : expenseRepository.sumByTypeBetween(d.periodStart(), end)) {
            boolean refund = row.getName().equalsIgnoreCase(BookingService.REFUND_EXPENSE_TYPE)
                || row.getName().equalsIgnoreCase(BookingService.TRANSFER_REFUND_EXPENSE_TYPE);
            (refund ? refunds : expenses).add(new NamedAmount(row.getName(), row.getTotal()));
        }

        BigDecimal totalExpenses = sum(expenses);
        BigDecimal totalPayout = d.totalNet().add(totalExpenses);
        BigDecimal percent = percent(totalPayout, d.totalBusiness());

        return new CycleFinalReportResponse(d.id(), d.periodStart(), d.periodEnd(), d.status(),
            d.totalBusiness(), d.totalNet(), d.incomeTypeTotals(), expenses, totalExpenses,
            totalPayout, percent, refunds, sum(refunds));
    }

    private static BigDecimal sum(List<NamedAmount> rows) {
        return rows.stream().map(NamedAmount::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
