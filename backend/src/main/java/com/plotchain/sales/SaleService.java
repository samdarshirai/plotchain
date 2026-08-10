package com.plotchain.sales;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.CompensationPlanVersionRepository;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleService;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.income.LedgerEntryStatus;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotNotFoundException;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

@Service
public class SaleService {

    private final PlotRepository plotRepository;
    private final AssociateRepository associateRepository;
    private final CycleService cycleService;
    private final CompensationPlanVersionRepository compensationPlanVersionRepository;
    private final SaleRepository saleRepository;
    private final LedgerEntryRepository ledgerEntryRepository;

    public SaleService(
            PlotRepository plotRepository,
            AssociateRepository associateRepository,
            CycleService cycleService,
            CompensationPlanVersionRepository compensationPlanVersionRepository,
            SaleRepository saleRepository,
            LedgerEntryRepository ledgerEntryRepository) {
        this.plotRepository = plotRepository;
        this.associateRepository = associateRepository;
        this.cycleService = cycleService;
        this.compensationPlanVersionRepository = compensationPlanVersionRepository;
        this.saleRepository = saleRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
    }

    // Sales unit 2 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // flow "Record a sale", steps 1-3): guards. Sales unit 3 (same doc, flow steps 4-9): the
    // Plot->SOLD flip, cycle lookup, Sale persistence, and Direct Income ledger entry, inserted
    // between the associate lookup and the response mapping below, all inside one transaction.
    @Transactional
    public SaleResponse recordSale(CreateSaleRequest request) {
        Plot plot = plotRepository.findByIdForUpdate(request.plotId())
            .orElseThrow(() -> new PlotNotFoundException(request.plotId()));

        if (plot.getStatus() != PlotStatus.AVAILABLE) {
            throw new PlotNotAvailableException(plot.getId());
        }

        Associate associate = associateRepository.findById(request.associateId())
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));

        // Flow step 4: flip Plot -> SOLD (Decision 1).
        plot.setStatus(PlotStatus.SOLD);
        plotRepository.save(plot);

        // Flow step 5.
        Cycle cycle = cycleService.getOrOpenCurrent();

        // Flow step 6: amount and legCredited are snapshots taken now, never live references
        // (Decisions 1 and 7) -- plot.getPrice() and associate.getPosition() are read once,
        // here, and never re-read from Sale later.
        Sale sale = new Sale();
        sale.setId(UUID.randomUUID());
        sale.setPlotId(plot.getId());
        sale.setAssociateId(associate.getId());
        sale.setBuyerName(request.buyerName());
        sale.setBuyerPhone(request.buyerPhone());
        sale.setBuyerEmail(request.buyerEmail());
        sale.setAmount(plot.getPrice());
        sale.setCycleId(cycle.getId());
        sale.setLegCredited(associate.getPosition());
        sale.setStatus(SaleStatus.RECORDED);
        sale.setRecordedAt(Instant.now());
        sale = saleRepository.save(sale);

        // Flow step 7: same pattern DashboardService already uses. An empty result here is a
        // data-integrity problem, not a valid "no income" case -- see this plan's "Missing
        // compensation plan version" section for why this throws instead of zeroing the ledger
        // entry. @Transactional means this also rolls back the Plot flip and Sale row above.
        CompensationPlanVersion planVersion = compensationPlanVersionRepository
            .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now())
            .orElseThrow(() -> new IllegalStateException(
                "compensation_plan_version row missing - V8 migration seeds it"));

        // Flow step 8: Direct Income, computed synchronously. Admin-charge deduction always
        // uses the without-PAN tier (Decision 4) -- Associate has no pan_number field.
        BigDecimal grossAmount = sale.getAmount()
            .multiply(planVersion.getDirectIncomePct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
        BigDecimal tdsDeduction = grossAmount
            .multiply(planVersion.getTdsPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
        BigDecimal adminDeduction = grossAmount
            .multiply(planVersion.getAdminChargeWithoutPanPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
        BigDecimal netAmount = grossAmount.subtract(tdsDeduction).subtract(adminDeduction);

        LedgerEntry ledgerEntry = new LedgerEntry();
        ledgerEntry.setId(UUID.randomUUID());
        ledgerEntry.setIncomeType(IncomeType.DIRECT);
        ledgerEntry.setAssociateId(sale.getAssociateId());
        ledgerEntry.setCycleId(sale.getCycleId());
        ledgerEntry.setGrossAmount(grossAmount);
        ledgerEntry.setTdsDeduction(tdsDeduction);
        ledgerEntry.setAdminDeduction(adminDeduction);
        ledgerEntry.setNetAmount(netAmount);
        ledgerEntry.setStatus(LedgerEntryStatus.PENDING);
        ledgerEntry.setSourceRef(sale.getId());
        ledgerEntry.setCreatedAt(Instant.now());
        ledgerEntryRepository.save(ledgerEntry);

        // Flow step 9.
        return toResponse(sale);
    }

    // Sales unit 4 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // flow "Void a sale", steps 1-2): guards. Sales unit 5 (same doc, flow steps 3-6): the
    // Sale->VOIDED flip, voidReason assignment, Plot->AVAILABLE flip, and LedgerEntry reversal,
    // inserted between the already-voided guard and the response mapping below, all inside one
    // transaction.
    @Transactional
    public SaleResponse voidSale(UUID id, VoidSaleRequest request) {
        Sale sale = saleRepository.findById(id)
            .orElseThrow(() -> new SaleNotFoundException(id));

        if (sale.getStatus() == SaleStatus.VOIDED) {
            throw new SaleAlreadyVoidedException(id);
        }

        // Flow step 3: Sale -> VOIDED, stamp the reason (Decision 6: a reversal, not a delete
        // or edit -- the Sale row is never removed).
        sale.setStatus(SaleStatus.VOIDED);
        sale.setVoidReason(request.reason());
        saleRepository.save(sale);

        // Flow step 4: Plot -> AVAILABLE, undoing the SOLD flip recordSale made (Decision 1).
        // A missing Plot row here is a data-integrity problem, not a valid outcome -- plot_id
        // has a NOT NULL FK constraint (V16__sale.sql), so every Sale always references a real
        // Plot row.
        Plot plot = plotRepository.findById(sale.getPlotId())
            .orElseThrow(() -> new IllegalStateException(
                "plot row missing for sale " + sale.getId() + " - plot_id has a NOT NULL FK constraint"));
        plot.setStatus(PlotStatus.AVAILABLE);
        plotRepository.save(plot);

        // Flow step 5: reverse the Direct Income ledger entry this sale created at record time
        // (Decision 6). Same data-integrity reasoning as the missing-Plot case above --
        // recordSale always creates exactly one LedgerEntry per Sale, in the same transaction.
        LedgerEntry ledgerEntry = ledgerEntryRepository.findBySourceRef(sale.getId())
            .orElseThrow(() -> new IllegalStateException(
                "ledger_entry row missing for sale " + sale.getId()
                    + " - recordSale always creates one in the same transaction"));
        ledgerEntry.setStatus(LedgerEntryStatus.REVERSED);
        ledgerEntryRepository.save(ledgerEntry);

        // Flow step 6.
        return toResponse(sale);
    }

    // Sales unit 6 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // "Admin register -- GET /api/admin/sales"): same optional-filter, page/size-clamped-by-the-
    // caller pattern as AdminAssociateService.list(). recordedTo is converted to an EXCLUSIVE
    // upper-bound Instant the same way joinedTo is in that method -- recorded_at is a TIMESTAMP
    // column, so a bare same-day Instant would exclude same-day sales on the last day requested.
    public AdminSalePageResponse list(
            UUID associateId, SaleStatus status, LocalDate recordedFrom, LocalDate recordedTo, int page, int size) {
        Instant recordedFromInstant = recordedFrom == null
            ? null : recordedFrom.atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant recordedToExclusive = recordedTo == null
            ? null : recordedTo.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();

        Page<Sale> result = saleRepository.searchRegister(
            associateId, status, recordedFromInstant, recordedToExclusive, PageRequest.of(page, size));

        List<SaleResponse> sales = result.getContent().stream().map(this::toResponse).toList();
        return new AdminSalePageResponse(sales, page, size, result.getTotalElements());
    }

    // Sales unit 7 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // "Associate own view -- GET /api/associates/me/sales"): self + full descendant subtree,
    // view-only, paginated. associateId always comes from the caller's own JWT (see
    // AssociateSaleController) -- there is no path for one associate to view another's sales
    // through this method.
    public AssociateSalePageResponse getMySales(UUID associateId, int page, int size) {
        List<UUID> selfAndDownlineIds = associateRepository.findSelfAndDownline(associateId);

        Page<Sale> result = saleRepository.findByAssociateIdInOrderByRecordedAtDesc(
            selfAndDownlineIds, PageRequest.of(page, size));

        List<SaleResponse> sales = result.getContent().stream().map(this::toResponse).toList();
        return new AssociateSalePageResponse(sales, page, size, result.getTotalElements());
    }

    private SaleResponse toResponse(Sale sale) {
        return new SaleResponse(
            sale.getId(),
            sale.getPlotId(),
            sale.getAssociateId(),
            sale.getBuyerName(),
            sale.getBuyerPhone(),
            sale.getBuyerEmail(),
            sale.getAmount(),
            sale.getCycleId(),
            sale.getLegCredited(),
            sale.getStatus().name(),
            sale.getVoidReason(),
            sale.getRecordedAt());
    }
}
