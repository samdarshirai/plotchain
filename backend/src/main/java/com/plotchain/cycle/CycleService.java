package com.plotchain.cycle;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.sales.Sale;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class CycleService {

    private final CycleRepository cycleRepository;
    private final AssociateRepository associateRepository;
    private final LegVolumeRepository legVolumeRepository;
    private final SaleRepository saleRepository;

    public CycleService(
        CycleRepository cycleRepository,
        AssociateRepository associateRepository,
        LegVolumeRepository legVolumeRepository,
        SaleRepository saleRepository
    ) {
        this.cycleRepository = cycleRepository;
        this.associateRepository = associateRepository;
        this.legVolumeRepository = legVolumeRepository;
        this.saleRepository = saleRepository;
    }

    public CyclePageResponse list(CycleStatus status, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        Page<Cycle> result = status == null
            ? cycleRepository.findAllByOrderByPeriodStartDesc(pageable)
            : cycleRepository.findByStatusOrderByPeriodStartDesc(status, pageable);

        return new CyclePageResponse(
            result.getContent().stream().map(this::toSummary).toList(),
            page, size, result.getTotalElements());
    }

    // Cycle-management unit 3 (row lock + OPEN check, unchanged) + unit 4 (everything from the
    // CALCULATING flip onward) -- docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #2, settlement batch flow steps 1, 2, 8. Steps 3-7 (Matching, Rank, Sponsor
    // Matching, Royalty, Reward) are NOT implemented here -- units 5-9 insert their own logic
    // between the rollup below and the CLOSED flip, without changing this method's signature or
    // transaction boundary, the same sequential-insertion pattern unit 3 -> unit 4 already used.
    @Transactional
    public CycleCloseResponse close(UUID id) {
        Cycle cycle = cycleRepository.findByIdForUpdate(id)
            .orElseThrow(() -> new CycleNotFoundException(id));

        if (cycle.getStatus() != CycleStatus.OPEN) {
            throw new CycleAlreadyClosedException(cycle.getId());
        }

        // Flow step 1 (partial): write only, not a separate commit -- Decision #2 -- so this
        // isn't externally observable mid-batch under this design, and rolls back along with
        // everything else if a later step throws.
        cycle.setStatus(CycleStatus.CALCULATING);
        cycleRepository.save(cycle);

        List<Associate> associates = associateRepository.findAll();
        List<Sale> sales = saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED);

        // Flow step 2.
        List<LegVolume> legVolumes = rollUpLegVolumes(cycle.getId(), associates, sales);
        legVolumeRepository.saveAll(legVolumes);

        // Flow step 8. getOrOpenCurrent() is a plain (non-@Transactional) self-invocation here,
        // so it runs inside the transaction this @Transactional method's proxy already started
        // -- exactly what Decision #1/#8 require, with no separate commit.
        cycle.setStatus(CycleStatus.CLOSED);
        cycleRepository.save(cycle);
        Cycle nextCycle = getOrOpenCurrent();

        return new CycleCloseResponse(cycle.getId(), cycle.getStatus(), legVolumes.size(), nextCycle.getId());
    }

    // Decision #4: a single in-memory post-order DFS pass, not N recursive SQL queries. Builds
    // parent->children adjacency from a plain findAll() (this decision's own "load every
    // Associate ... into memory once" language, and this platform's expected scale per the
    // spec's Open Question #1, don't call for a leaner projection query), then walks every root
    // (parentId == null -- exactly one in production, the Admin; zero in an associate-less
    // environment like this codebase's own CycleCloseConcurrencyTest fixture, which then simply
    // rolls up nothing rather than throwing).
    private List<LegVolume> rollUpLegVolumes(UUID cycleId, List<Associate> associates, List<Sale> sales) {
        Map<UUID, BigDecimal> ownSaleVolume = new HashMap<>();
        for (Sale sale : sales) {
            ownSaleVolume.merge(sale.getAssociateId(), sale.getAmount(), BigDecimal::add);
        }

        Map<UUID, Associate> leftChildOf = new HashMap<>();
        Map<UUID, Associate> rightChildOf = new HashMap<>();
        List<UUID> rootIds = new ArrayList<>();
        for (Associate associate : associates) {
            UUID parentId = associate.getParentId();
            if (parentId == null) {
                rootIds.add(associate.getId());
            } else if ("R".equals(associate.getPosition())) {
                rightChildOf.put(parentId, associate);
            } else {
                leftChildOf.put(parentId, associate);
            }
        }

        UUID previousClosedCycleId = cycleRepository
            .findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)
            .map(Cycle::getId)
            .orElse(null);

        List<LegVolume> legVolumes = new ArrayList<>();
        for (UUID rootId : rootIds) {
            rollUpSubtree(rootId, cycleId, previousClosedCycleId, ownSaleVolume, leftChildOf, rightChildOf, legVolumes);
        }
        return legVolumes;
    }

    // Post-order: recurses into both children before computing this node's own subtreeVolume,
    // matching Decision #4's subtreeVolume(node) = own + subtreeVolume(left) + subtreeVolume(right)
    // (0 for a missing child). Appends exactly one LegVolume row for this node to legVolumes
    // (unconditionally, even all-zero) before returning, and returns this node's subtreeVolume
    // so its parent's own call can consume it as one of its two child terms.
    private BigDecimal rollUpSubtree(
        UUID associateId,
        UUID cycleId,
        UUID previousClosedCycleId,
        Map<UUID, BigDecimal> ownSaleVolume,
        Map<UUID, Associate> leftChildOf,
        Map<UUID, Associate> rightChildOf,
        List<LegVolume> legVolumes
    ) {
        Associate leftChild = leftChildOf.get(associateId);
        Associate rightChild = rightChildOf.get(associateId);

        BigDecimal leftSubtreeVolume = leftChild == null
            ? BigDecimal.ZERO
            : rollUpSubtree(leftChild.getId(), cycleId, previousClosedCycleId, ownSaleVolume, leftChildOf, rightChildOf, legVolumes);
        BigDecimal rightSubtreeVolume = rightChild == null
            ? BigDecimal.ZERO
            : rollUpSubtree(rightChild.getId(), cycleId, previousClosedCycleId, ownSaleVolume, leftChildOf, rightChildOf, legVolumes);

        BigDecimal ownVolume = ownSaleVolume.getOrDefault(associateId, BigDecimal.ZERO);
        BigDecimal subtreeVolume = ownVolume.add(leftSubtreeVolume).add(rightSubtreeVolume);

        BigDecimal leftLegVolume = BigDecimal.ZERO;
        BigDecimal rightLegVolume = BigDecimal.ZERO;
        if (leftChild != null || rightChild != null) {
            BigDecimal carriedForwardLeft = BigDecimal.ZERO;
            BigDecimal carriedForwardRight = BigDecimal.ZERO;
            if (previousClosedCycleId != null) {
                LegVolume priorCycleLegVolume = legVolumeRepository
                    .findByAssociateIdAndCycleId(associateId, previousClosedCycleId)
                    .orElse(null);
                if (priorCycleLegVolume != null) {
                    carriedForwardLeft = priorCycleLegVolume.getCarriedForwardLeft();
                    carriedForwardRight = priorCycleLegVolume.getCarriedForwardRight();
                }
            }
            leftLegVolume = leftSubtreeVolume.add(carriedForwardLeft);
            rightLegVolume = rightSubtreeVolume.add(carriedForwardRight);
        }

        legVolumes.add(new LegVolume(
            UUID.randomUUID(), associateId, cycleId, leftLegVolume, rightLegVolume, BigDecimal.ZERO, BigDecimal.ZERO));

        return subtreeVolume;
    }

    // Sales unit 1 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // Decision 5): returns today's OPEN cycle under the PRD's 1st-15th / 16th-end-of-month
    // cadence, creating one only if no existing cycle covers today. Reuses the existing
    // findFirstByStatusOrderByPeriodStartDesc query rather than adding a new repository method,
    // since at most one OPEN cycle is expected to exist at a time; if the most recent OPEN
    // cycle's stored period doesn't cover today (e.g. it's stale), a new cycle is created for
    // today's period without inspecting older OPEN cycles.
    public Cycle getOrOpenCurrent() {
        LocalDate today = LocalDate.now();

        return cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)
            .filter(cycle -> covers(cycle, today))
            .orElseGet(() -> openNewCycle(today));
    }

    private boolean covers(Cycle cycle, LocalDate date) {
        return !date.isBefore(cycle.getPeriodStart()) && !date.isAfter(cycle.getPeriodEnd());
    }

    private Cycle openNewCycle(LocalDate today) {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(periodStartFor(today));
        cycle.setPeriodEnd(periodEndFor(today));
        cycle.setStatus(CycleStatus.OPEN);
        return cycleRepository.save(cycle);
    }

    private LocalDate periodStartFor(LocalDate date) {
        return date.getDayOfMonth() <= 15 ? date.withDayOfMonth(1) : date.withDayOfMonth(16);
    }

    private LocalDate periodEndFor(LocalDate date) {
        return date.getDayOfMonth() <= 15
            ? date.withDayOfMonth(15)
            : date.withDayOfMonth(date.lengthOfMonth());
    }

    private CycleSummaryResponse toSummary(Cycle cycle) {
        return new CycleSummaryResponse(cycle.getId(), cycle.getPeriodStart(), cycle.getPeriodEnd(), cycle.getStatus());
    }
}
