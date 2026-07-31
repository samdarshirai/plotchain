package com.plotchain.company;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/company/audit-log")
public class SettingsAuditController {
    private final SettingsAuditService settingsAuditService;

    public SettingsAuditController(SettingsAuditService settingsAuditService) {
        this.settingsAuditService = settingsAuditService;
    }

    @GetMapping
    public SettingsAuditPageResponse list(
            @RequestParam(required = false) String section,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        size = Math.min(size, 100);
        return settingsAuditService.list(section, page, size);
    }
}
