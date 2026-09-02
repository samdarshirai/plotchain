package com.plotchain.sales;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.KycStatus;
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.CompensationPlanVersionRepository;
import com.plotchain.compensation.SelfPerformanceBonusConfigService;
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
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectNotFoundException;
import com.plotchain.projects.ProjectRepository;
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
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class SaleService {

    private final PlotRepository plotRepository;
    private final AssociateRepository associateRepository;
    private final CycleService cycleService;
    private final CompensationPlanVersionRepository compensationPlanVersionRepository;
    private final SaleRepository saleRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final SelfPerformanceBonusConfigService selfPerformanceBonusConfigService;
    private final ProjectRepository projectRepository;

    public SaleService(
            PlotRepository plotRepository,
            AssociateRepository associateRepository,
            CycleService cycleService,
            CompensationPlanVersionRepository compensationPlanVersionRepository,
            SaleRepository saleRepository,
            LedgerEntryRepository ledgerEntryRepository,
            SelfPerformanceBonusConfigService selfPerformanceBonusConfigService,
            ProjectRepository projectRepository) {
        this.plotRepository = plotRepository;
        this.associateRepository = associateRepository;
        this.cycleService = cycleService;
        this.compensationPlanVersionRepository = compensationPlanVersionRepository;
        this.saleRepository = saleRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.selfPerformanceBonusConfigService = selfPerformanceBonusConfigService;
        this.projectRepository = projectRepository;
    }

    // Sales unit 2 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // flow "Record a sale", steps 1-3): guards. Sales unit 3 (same doc, flow steps 4-9): the
    // Plot->SOLD flip, cycle lookup, Sale persistence, and Direct Income ledger entry, inserted
    // between the associate lookup and the response mapping below, all inside one transaction.
    //
    // Mandatory-fields change on /admin/sales/new: plotId is now optional -- a sale need not be
    // tied to a specific inventory Plot. When present, the Plot guard/lock/SOLD-flip stays first
    // (before Associate/Project) so the row-lock concurrency proof above still holds and a
    // not-found/not-available Plot still fails fast before touching anything else. associateId
    // stays required -- legCredited (below) and the leg-volume rollup that drives Matching/
    // Sponsor Matching/Royalty/Reward income (CycleService.rollUpLegVolumes) both key off it, so
    // it can't go null. projectId is a new required, first-class field (previously only derivable
    // via plotId -> Plot.projectId).
    @Transactional
    public SaleResponse recordSale(CreateSaleRequest request) {
        Plot plot = null;
        if (request.plotId() != null) {
            plot = plotRepository.findByIdForUpdate(request.plotId())
                .orElseThrow(() -> new PlotNotFoundException(request.plotId()));

            if (plot.getStatus() != PlotStatus.AVAILABLE) {
                throw new PlotNotAvailableException(plot.getId());
            }
        }

        Associate associate = associateRepository.findById(request.associateId())
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));

        Project project = projectRepository.findById(request.projectId())
            .orElseThrow(() -> new ProjectNotFoundException(request.projectId()));

        // Flow step 4: flip Plot -> SOLD (Decision 1) -- only when a Plot is linked.
        if (plot != null) {
            plot.setStatus(PlotStatus.SOLD);
            plotRepository.save(plot);
        }

        // Flow step 5.
        Cycle cycle = cycleService.getOrOpenCurrent();

        // Flow step 6: amount and legCredited are snapshots taken now, never live references
        // (Decisions 1 and 7) -- request.price() and associate.getPosition() are read once, here,
        // and never re-read from Sale later. amount is the admin-entered price (request.price()),
        // not a Plot.price snapshot -- price is now a mandatory client input for every sale,
        // whether or not a Plot is linked.
        Sale sale = new Sale();
        sale.setId(UUID.randomUUID());
        sale.setPlotId(plot != null ? plot.getId() : null);
        sale.setProjectId(project.getId());
        sale.setAssociateId(associate.getId());
        sale.setBuyerName(request.buyerName());
        sale.setBuyerPhone(request.buyerPhone());
        sale.setBuyerEmail(request.buyerEmail());
        sale.setNote(request.note());
        sale.setAmount(request.price());
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

        // Self-Performance Bonus: same shape as Direct Income above (self-only, sale-time,
        // this sale's own amount), gated by SelfPerformanceBonusConfigService.isEnabled() and
        // the plot's area crossing one of the two tier thresholds on this same planVersion.
        // Highest qualifying tier wins; below the lower threshold, no entry (compensation-plan-
        // reference.md's own Known Gap: no rate is documented below 2,000 sqft). Also gated on
        // plot != null -- SPB's tier lookup needs Plot.areaSqft, which a plotless sale doesn't
        // have; skipping SPB for those is a documented gap from the mandatory-fields change, not
        // a bug.
        if (selfPerformanceBonusConfigService.isEnabled() && plot != null) {
            BigDecimal areaSqft = plot.getAreaSqft();
            BigDecimal selfPerformancePct = null;
            if (areaSqft.compareTo(planVersion.getSelfPerformanceTier2SqftThreshold()) >= 0) {
                selfPerformancePct = planVersion.getSelfPerformanceTier2Pct();
            } else if (areaSqft.compareTo(planVersion.getSelfPerformanceTier1SqftThreshold()) >= 0) {
                selfPerformancePct = planVersion.getSelfPerformanceTier1Pct();
            }

            if (selfPerformancePct != null) {
                BigDecimal spGrossAmount = sale.getAmount()
                    .multiply(selfPerformancePct.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
                if (spGrossAmount.compareTo(BigDecimal.ZERO) > 0) {
                    BigDecimal spTdsDeduction = spGrossAmount
                        .multiply(planVersion.getTdsPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
                    BigDecimal spAdminDeduction = spGrossAmount
                        .multiply(planVersion.getAdminChargeWithoutPanPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
                    BigDecimal spNetAmount = spGrossAmount.subtract(spTdsDeduction).subtract(spAdminDeduction);

                    LedgerEntry selfPerformanceEntry = new LedgerEntry();
                    selfPerformanceEntry.setId(UUID.randomUUID());
                    selfPerformanceEntry.setIncomeType(IncomeType.SELF_PERFORMANCE);
                    selfPerformanceEntry.setAssociateId(sale.getAssociateId());
                    selfPerformanceEntry.setCycleId(sale.getCycleId());
                    selfPerformanceEntry.setGrossAmount(spGrossAmount);
                    selfPerformanceEntry.setTdsDeduction(spTdsDeduction);
                    selfPerformanceEntry.setAdminDeduction(spAdminDeduction);
                    selfPerformanceEntry.setNetAmount(spNetAmount);
                    selfPerformanceEntry.setStatus(kycGatedStatus(associate));
                    selfPerformanceEntry.setSourceRef(sale.getId());
                    selfPerformanceEntry.setCreatedAt(Instant.now());
                    ledgerEntryRepository.save(selfPerformanceEntry);
                }
            }
        }

        // Flow step 9. plot and project are already loaded above -- toResponse(sale, plot,
        // associate, project) reuses them instead of re-fetching via toResponses' batch lookups.
        return toResponse(sale, plot, associate, project);
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

        // Flow step 4: Plot -> AVAILABLE, undoing the SOLD flip recordSale made (Decision 1) --
        // only when this sale has a linked Plot (plot_id is optional since the mandatory-fields
        // change; recordSale only flips a Plot to SOLD when one was linked in the first place, so
        // a null plot_id here is a plotless sale, not a data-integrity problem). When plot_id IS
        // set, a missing Plot row is still a data-integrity problem -- the FK constraint guarantees
        // a set plot_id always references a real Plot row.
        Plot plot = null;
        if (sale.getPlotId() != null) {
            plot = plotRepository.findById(sale.getPlotId())
                .orElseThrow(() -> new IllegalStateException(
                    "plot row missing for sale " + sale.getId() + " - plot_id has an FK constraint"));
            plot.setStatus(PlotStatus.AVAILABLE);
            plotRepository.save(plot);
        }

        // Flow step 5: reverse every ledger entry this sale created at record time (Direct
        // Income always, Self-Performance Bonus when it was enabled and the area qualified) --
        // Decision 6 (self-performance-bonus design). Same data-integrity reasoning as the
        // missing-Plot case above -- recordSale always creates at least one LedgerEntry per Sale
        // (Direct Income), in the same transaction.
        List<LedgerEntry> ledgerEntries = ledgerEntryRepository.findAllBySourceRef(sale.getId());
        if (ledgerEntries.isEmpty()) {
            throw new IllegalStateException(
                "ledger_entry row missing for sale " + sale.getId()
                    + " - recordSale always creates one in the same transaction");
        }
        for (LedgerEntry ledgerEntry : ledgerEntries) {
            ledgerEntry.setStatus(LedgerEntryStatus.REVERSED);
            ledgerEntryRepository.save(ledgerEntry);
        }

        // Flow step 6. plot is already loaded above (when linked) -- toResponse(sale, plot,
        // associate, project) reuses it instead of re-fetching via toResponses' batch Plot
        // lookup. associate and project are fresh, single lookups (never loaded elsewhere in this
        // method) resolved null-safely -- not the missing-Plot case's strict IllegalStateException
        // a few lines up, since a missing associate/project here is a display-field gap, not a
        // broken data invariant blocking the write.
        Associate associate = associateRepository.findById(sale.getAssociateId()).orElse(null);
        Project project = projectRepository.findById(sale.getProjectId()).orElse(null);
        return toResponse(sale, plot, associate, project);
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

        List<SaleResponse> sales = toResponses(result.getContent());
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

        List<SaleResponse> sales = toResponses(result.getContent());
        return new AssociateSalePageResponse(sales, page, size, result.getTotalElements());
    }

    // dashboard-mockup spec §3.1 and 2026-08-23-admin-dashboard-mockup-design.md §3.1:
    // plotNo/projectName/associateUserId/associateName are all resolved here via batch lookups
    // (three IN-queries total, regardless of how many sales are being mapped) rather than a
    // per-row join or per-row repository call. recordSale/voidSale don't route through this --
    // they already hold their own Plot/Associate/Project from earlier in their own flow, so they
    // call toResponse(sale, plot, associate, project) directly instead of re-fetching here.
    //
    // Mandatory-fields change on /admin/sales/new: projectName now resolves from Sale.projectId
    // directly (a first-class, mandatory field), not by joining through Plot -- plotId is
    // optional now, so a plotless sale must still have a projectName. plotNo stays Plot-derived
    // and null-safe for that reason.
    private List<SaleResponse> toResponses(List<Sale> sales) {
        List<UUID> plotIds = sales.stream().map(Sale::getPlotId).filter(Objects::nonNull).distinct().toList();
        Map<UUID, Plot> plotsById = plotRepository.findAllById(plotIds).stream()
            .collect(Collectors.toMap(Plot::getId, p -> p));
        List<UUID> projectIds = sales.stream().map(Sale::getProjectId).filter(Objects::nonNull).distinct().toList();
        Map<UUID, String> projectNamesByProjectId = projectRepository.findAllById(projectIds).stream()
            .collect(Collectors.toMap(Project::getId, Project::getName));
        List<UUID> associateIds = sales.stream().map(Sale::getAssociateId).distinct().toList();
        Map<UUID, Associate> associatesById = associateRepository.findAllById(associateIds).stream()
            .collect(Collectors.toMap(Associate::getId, a -> a));

        return sales.stream().map(sale -> {
            Plot plot = sale.getPlotId() != null ? plotsById.get(sale.getPlotId()) : null;
            String plotNo = plot != null ? plot.getPlotNo() : null;
            String projectName = projectNamesByProjectId.get(sale.getProjectId());
            Associate associate = associatesById.get(sale.getAssociateId());
            String associateUserId = associate != null ? associate.getUserId() : null;
            String associateName = associate != null ? associate.getName() : null;
            return buildResponse(sale, plotNo, projectName, associateUserId, associateName);
        }).toList();
    }

    // recordSale/voidSale's single-sale path: both already hold the Plot, Associate, and Project
    // they need (recordSale from its own guard-loading earlier in the same transaction; voidSale
    // via fresh single findByIds), so this uses them directly instead of routing through
    // toResponses' batch findAllById, which would silently re-fetch rows already in memory.
    private SaleResponse toResponse(Sale sale, Plot plot, Associate associate, Project project) {
        String plotNo = plot != null ? plot.getPlotNo() : null;
        String projectName = project != null ? project.getName() : null;
        String associateUserId = associate != null ? associate.getUserId() : null;
        String associateName = associate != null ? associate.getName() : null;
        return buildResponse(sale, plotNo, projectName, associateUserId, associateName);
    }

    private SaleResponse buildResponse(
            Sale sale, String plotNo, String projectName, String associateUserId, String associateName) {
        return new SaleResponse(
            sale.getId(), sale.getPlotId(), sale.getAssociateId(),
            sale.getBuyerName(), sale.getBuyerPhone(), sale.getBuyerEmail(),
            sale.getAmount(), sale.getCycleId(), sale.getLegCredited(),
            sale.getStatus().name(), sale.getVoidReason(), sale.getRecordedAt(),
            plotNo, projectName, associateUserId, associateName, sale.getNote());
    }

    // Duplicates CycleService.kycGatedStatus()'s one-line logic rather than extracting a shared
    // utility -- consistent with how the deduction math above is already duplicated between the
    // two classes; no cross-class extraction is in scope here.
    private LedgerEntryStatus kycGatedStatus(Associate associate) {
        return associate.getKycStatus() == KycStatus.VERIFIED
            ? LedgerEntryStatus.PENDING
            : LedgerEntryStatus.CARRIED_FORWARD;
    }
}
