package com.plotchain.compensation;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/company/compensation")
public class CompensationPlanController {

    private final CompensationPlanService compensationPlanService;

    public CompensationPlanController(CompensationPlanService compensationPlanService) {
        this.compensationPlanService = compensationPlanService;
    }

    @GetMapping
    public CompensationPlanResponse getCurrent() {
        return compensationPlanService.getCurrentPlan();
    }

    @GetMapping("/history")
    public List<CompensationPlanSummaryResponse> getHistory() {
        return compensationPlanService.getHistory();
    }

    @PutMapping
    public CompensationPlanResponse update(
            @Valid @RequestBody CompensationPlanRequest request,
            @AuthenticationPrincipal UUID adminId) {
        return compensationPlanService.updatePlan(request, adminId);
    }
}
