package com.plotchain.cycle;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/cycles")
public class CycleController {

    private final CycleService cycleService;

    public CycleController(CycleService cycleService) {
        this.cycleService = cycleService;
    }

    @GetMapping
    public CyclePageResponse list(
        @RequestParam(required = false) CycleStatus status,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return cycleService.list(status, page, size);
    }

    @GetMapping("/{id}")
    public CycleDetailResponse detail(@PathVariable UUID id) {
        return cycleService.getDetail(id);
    }

    @PostMapping("/{id}/close")
    public CycleCloseResponse close(@PathVariable UUID id) {
        return cycleService.close(id);
    }
}
