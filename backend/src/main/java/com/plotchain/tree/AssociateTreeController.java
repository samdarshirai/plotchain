package com.plotchain.tree;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class AssociateTreeController {

    private final TreeExplorerService treeExplorerService;

    public AssociateTreeController(TreeExplorerService treeExplorerService) {
        this.treeExplorerService = treeExplorerService;
    }

    // Self-scoped by construction: associateId comes only from the authenticated JWT
    // principal, never a path or query parameter, so there is no way to reach another
    // associate's subtree through this route (role-capability data-visibility spec:
    // "Subtree rooted at self only -- own direct downline + full L/R descendants").
    // Depth default/clamp mirrors the admin-only TreeExplorerController.subtree() route
    // exactly, for the same reason documented there: an unclamped depth could trigger a
    // 2^(depth+1)-1 node recursive fetch and exhaust server memory/time.
    @GetMapping("/api/associates/me/tree")
    public TreeNodeResponse myTree(@AuthenticationPrincipal UUID associateId,
                                    @RequestParam(defaultValue = "3") int depth) {
        depth = Math.max(0, Math.min(depth, 5));
        return treeExplorerService.subtree(associateId, depth);
    }
}
