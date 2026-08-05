package com.plotchain.sales;

import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotNotFoundException;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import org.springframework.stereotype.Service;

@Service
public class SaleService {

    private final PlotRepository plotRepository;
    private final AssociateRepository associateRepository;

    public SaleService(PlotRepository plotRepository, AssociateRepository associateRepository) {
        this.plotRepository = plotRepository;
        this.associateRepository = associateRepository;
    }

    // Sales unit 2 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // flow "Record a sale", steps 1-3): guards only. Unit 3 inserts the happy-path Plot->SOLD
    // flip, cycle lookup, Sale persistence, and Direct Income ledger entry between the
    // associate lookup below and the placeholder throw -- sequentially, without changing this
    // method's signature -- following the same convention CycleService.close() established for
    // its own unit 4 placeholder.
    public SaleResponse recordSale(CreateSaleRequest request) {
        Plot plot = plotRepository.findById(request.plotId())
            .orElseThrow(() -> new PlotNotFoundException(request.plotId()));

        if (plot.getStatus() != PlotStatus.AVAILABLE) {
            throw new PlotNotAvailableException(plot.getId());
        }

        associateRepository.findById(request.associateId())
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));

        // Placeholder: unit 3 replaces this line with Plot->SOLD, cycle lookup, Sale creation,
        // and the Direct Income ledger entry (source spec flow steps 4-9).
        throw new UnsupportedOperationException(
            "Sale recording happy path is not yet implemented (Sales unit 3)");
    }
}
