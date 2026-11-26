package com.plotchain.cycle;

import com.plotchain.expense.ExpenseRepository;
import com.plotchain.expense.ExpenseTypeTotal;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FinalReportServiceTest {

    private final CycleService cycleService = mock(CycleService.class);
    private final ExpenseRepository expenseRepository = mock(ExpenseRepository.class);
    private final FinalReportService service = new FinalReportService(cycleService, expenseRepository);

    private static ExpenseTypeTotal row(String name, long total) {
        return new ExpenseTypeTotal() {
            public String getName() { return name; }
            public BigDecimal getTotal() { return BigDecimal.valueOf(total); }
        };
    }

    private void cycles(UUID... ids) {
        when(cycleService.list(null, 0, Integer.MAX_VALUE)).thenReturn(new CyclePageResponse(
            java.util.Arrays.stream(ids).map(i -> new CycleSummaryResponse(i, null, null, CycleStatus.CLOSED)).toList(),
            0, Integer.MAX_VALUE, ids.length));
    }

    private void cycle(UUID id, LocalDate start, LocalDate end, long net, long business, ExpenseTypeTotal... exp) {
        when(cycleService.getDetail(id)).thenReturn(new CycleDetailResponse(id, start, end, CycleStatus.CLOSED,
            List.of(), BigDecimal.valueOf(net), BigDecimal.valueOf(business), BigDecimal.valueOf(net), BigDecimal.ZERO));
        when(expenseRepository.sumByTypeBetween(start, end)).thenReturn(List.of(exp));
    }

    private static final LocalDate D1 = LocalDate.of(2026, 10, 1), D2 = LocalDate.of(2026, 10, 15),
        D3 = LocalDate.of(2026, 11, 1), D4 = LocalDate.of(2026, 11, 15);

    @Test
    void padsMissingTypesAndSumsTotalRow() {
        UUID a = UUID.randomUUID(), b = UUID.randomUUID();
        cycles(b, a);
        // a: 250000 net + 40000 expenses = 290000 on 1,000,000 -> 29%
        cycle(a, D1, D2, 250000, 1000000, row("Salary", 10000), row("Trip Expense", 30000),
            row("Plot Cancellation Refund", 5000));
        // b: 200000 net + 20000 = 220000 on 800000 -> 27.5%
        cycle(b, D3, D4, 200000, 800000, row("Office", 20000), row("Plot Transfer Refund", 7000));

        var t = service.getFinalReportTable(null);

        assertThat(t.expenseTypes()).containsExactly("Office", "Salary", "Trip Expense");
        assertThat(t.refundTypes()).containsExactly("Plot Cancellation Refund", "Plot Transfer Refund");
        assertThat(t.rows()).extracting(CycleFinalReportResponse::cycleId).containsExactly(b, a);
        // padded: b has no Salary/Trip, a has no Office
        assertThat(t.rows().get(0).expenses()).extracting(CycleFinalReportResponse.NamedAmount::name)
            .containsExactly("Office", "Salary", "Trip Expense");
        assertThat(t.rows().get(0).expenses().get(1).amount()).isEqualByComparingTo("0");
        assertThat(t.rows().get(1).expenses().get(0).amount()).isEqualByComparingTo("0");
        assertThat(t.rows().get(0).refunds().get(0).amount()).isEqualByComparingTo("0");

        var total = t.total();
        assertThat(total.cycleId()).isNull();
        assertThat(total.periodStart()).isNull();
        assertThat(total.periodEnd()).isNull();
        assertThat(total.status()).isNull();
        assertThat(total.incomeTypeTotals()).isEmpty();
        assertThat(total.totalBusiness()).isEqualByComparingTo("1800000");
        assertThat(total.netCommission()).isEqualByComparingTo("450000");
        assertThat(total.expenses()).extracting(e -> e.amount().intValue()).containsExactly(20000, 10000, 30000);
        assertThat(total.refunds()).extracting(e -> e.amount().intValue()).containsExactly(5000, 7000);
        assertThat(total.totalExpenses()).isEqualByComparingTo("60000");
        assertThat(total.totalRefunds()).isEqualByComparingTo("12000");
        assertThat(total.totalPayout()).isEqualByComparingTo("510000");
        // recomputed 510000*100/1800000 = 28.33, not 29 + 27.5
        assertThat(t.rows().get(1).payoutPercent()).isEqualByComparingTo("29.00");
        assertThat(t.rows().get(0).payoutPercent()).isEqualByComparingTo("27.50");
        assertThat(total.payoutPercent()).isEqualByComparingTo("28.33");
    }

    @Test
    void zeroBusinessGivesZeroPercent() {
        UUID a = UUID.randomUUID();
        cycles(a);
        cycle(a, D1, D2, 0, 0);
        var t = service.getFinalReportTable(null);
        assertThat(t.rows().get(0).payoutPercent()).isEqualByComparingTo("0");
        assertThat(t.total().payoutPercent()).isEqualByComparingTo("0");
    }

    @Test
    void noCyclesGivesZeroTotal() {
        cycles();
        var t = service.getFinalReportTable(null);
        assertThat(t.rows()).isEmpty();
        assertThat(t.expenseTypes()).isEmpty();
        assertThat(t.refundTypes()).isEmpty();
        assertThat(t.total().totalBusiness()).isEqualByComparingTo("0");
        assertThat(t.total().totalPayout()).isEqualByComparingTo("0");
        assertThat(t.total().payoutPercent()).isEqualByComparingTo("0");
        assertThat(t.total().expenses()).isEmpty();
    }

    @Test
    void openCycleUsesTodayAsWindowEnd() {
        UUID a = UUID.randomUUID();
        cycles(a);
        when(cycleService.getDetail(a)).thenReturn(new CycleDetailResponse(a, D3, null, CycleStatus.OPEN,
            List.of(), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO));
        when(expenseRepository.sumByTypeBetween(any(), any())).thenReturn(List.of());
        service.getFinalReportTable(null);
        verify(expenseRepository).sumByTypeBetween(D3, LocalDate.now());
    }

    @Test
    void filterKeepsOnlySelectedCyclesAndSumsJustThose() {
        UUID a = UUID.randomUUID(), b = UUID.randomUUID();
        cycles(b, a);
        cycle(a, D1, D2, 250000, 1000000, row("Salary", 10000));
        cycle(b, D3, D4, 200000, 800000, row("Office", 20000), row("Plot Transfer Refund", 7000));

        var t = service.getFinalReportTable(List.of(a));

        assertThat(t.rows()).extracting(CycleFinalReportResponse::cycleId).containsExactly(a);
        assertThat(t.expenseTypes()).containsExactly("Salary");
        assertThat(t.refundTypes()).isEmpty();
        assertThat(t.total().totalBusiness()).isEqualByComparingTo("1000000");
        assertThat(t.total().totalPayout()).isEqualByComparingTo("260000");
        assertThat(t.allCycles()).extracting(FinalReportTableResponse.CycleOption::cycleId).containsExactly(b, a);
    }

    @Test
    void emptySelectionGivesNoRowsZeroTotalButFullAllCycles() {
        UUID a = UUID.randomUUID(), b = UUID.randomUUID();
        cycles(b, a);
        cycle(a, D1, D2, 250000, 1000000, row("Salary", 10000));
        cycle(b, D3, D4, 200000, 800000);

        var t = service.getFinalReportTable(List.of());

        assertThat(t.rows()).isEmpty();
        assertThat(t.expenseTypes()).isEmpty();
        assertThat(t.total().totalBusiness()).isEqualByComparingTo("0");
        assertThat(t.total().payoutPercent()).isEqualByComparingTo("0");
        assertThat(t.allCycles()).hasSize(2);
    }

    @Test
    void unknownIdIsIgnoredAndNullMeansAll() {
        UUID a = UUID.randomUUID(), b = UUID.randomUUID();
        cycles(b, a);
        cycle(a, D1, D2, 250000, 1000000);
        cycle(b, D3, D4, 200000, 800000);

        assertThat(service.getFinalReportTable(List.of(a, UUID.randomUUID())).rows()).hasSize(1);
        assertThat(service.getFinalReportTable(null).rows()).hasSize(2);
    }
}
