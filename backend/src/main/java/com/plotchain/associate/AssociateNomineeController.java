package com.plotchain.associate;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Self-scoped by construction, same pattern as AssociateBankDetailsController: the target
// associate always comes from the verified JWT (@AuthenticationPrincipal), never a
// path/query/body parameter.
@RestController
@RequestMapping("/api/associates/me/nominee")
public class AssociateNomineeController {

    private final AssociateNomineeService associateNomineeService;

    public AssociateNomineeController(AssociateNomineeService associateNomineeService) {
        this.associateNomineeService = associateNomineeService;
    }

    @GetMapping
    public AssociateNomineeResponse get(@AuthenticationPrincipal UUID associateId) {
        return associateNomineeService.getNominee(associateId);
    }

    @PutMapping
    public AssociateNomineeResponse update(
        @AuthenticationPrincipal UUID associateId,
        @Valid @RequestBody UpdateAssociateNomineeRequest request
    ) {
        return associateNomineeService.updateNominee(associateId, request);
    }
}
