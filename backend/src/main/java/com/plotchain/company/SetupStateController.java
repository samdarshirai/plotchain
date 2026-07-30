package com.plotchain.company;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/company")
public class SetupStateController {

    private final SetupStateService setupStateService;

    public SetupStateController(SetupStateService setupStateService) {
        this.setupStateService = setupStateService;
    }

    @GetMapping("/setup-state")
    public SetupStateResponse getSetupState() {
        return setupStateService.getSetupState();
    }

    // Covered by SecurityConfig's existing blanket admin-family write rule; no separate matcher
    // needed for this POST.
    @PostMapping("/launch")
    public SetupStateResponse launch(@Valid @RequestBody LaunchRequest request) {
        return setupStateService.launch();
    }
}
