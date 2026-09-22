package com.plotchain.tree;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/associates/me/tree")
public class AssociateTreeController {

    private final TreeExplorerService treeExplorerService;

    public AssociateTreeController(TreeExplorerService treeExplorerService) {
        this.treeExplorerService = treeExplorerService;
    }

    // Self-scoped by construction: the caller's associateId comes only from the authenticated
    // JWT principal, never a path or query parameter, so there is no way to reach another
    // associate's subtree except through the explicit downline membership check in
    // subtreeWithinDownline()/searchWithinDownline() below (role-capability data-visibility
    // spec: "Subtree rooted at self only -- own direct downline + full L/R descendants").
    // Depth default/clamp mirrors the admin-only TreeExplorerController.subtree() route
    // exactly, for the same reason documented there: an unclamped depth could trigger a
    // 2^(depth+1)-1 node recursive fetch and exhaust server memory/time.
    @GetMapping
    public TreeNodeResponse myTree(@AuthenticationPrincipal UUID associateId,
                                    @RequestParam(defaultValue = "3") int depth) {
        depth = Math.max(0, Math.min(depth, 5));
        return treeExplorerService.subtree(associateId, depth);
    }

    // Re-root the my-tree view at a downline associate (search result or card click). targetId
    // must be in the caller's own findSelfAndDownline set -- see subtreeWithinDownline().
    @GetMapping("/{targetId}")
    public TreeNodeResponse mySubtree(@AuthenticationPrincipal UUID associateId,
                                       @PathVariable UUID targetId,
                                       @RequestParam(defaultValue = "3") int depth) {
        depth = Math.max(0, Math.min(depth, 5));
        return treeExplorerService.subtreeWithinDownline(associateId, targetId, depth);
    }

    // Downline-only search bar for /my-tree. Spring resolves this literal "/search" segment
    // ahead of the "/{targetId}" pattern above regardless of declaration order (same reliance
    // the admin-only TreeExplorerController already has on this same routing behavior).
    @GetMapping("/search")
    public TreeSearchResponse mySearch(@AuthenticationPrincipal UUID associateId, @RequestParam String q) {
        return treeExplorerService.searchWithinDownline(associateId, q);
    }

    // Hover details for /my-tree (associate-scoped counterpart of the admin
    // TreeExplorerController's "/{associateId}/details"). Two path segments past the base
    // mapping, same as "/{targetId}" above plus a literal suffix -- Spring resolves this
    // correctly alongside "/{targetId}" and "/search" without ambiguity. No SecurityConfig
    // matcher needed: this route is self-scoped, reachable by any authenticated associate,
    // same as every other route on this controller.
    @GetMapping("/{targetId}/details")
    public TreeNodeDetailsResponse myNodeDetails(@AuthenticationPrincipal UUID associateId, @PathVariable UUID targetId) {
        return treeExplorerService.nodeDetailsWithinDownline(associateId, targetId);
    }
}
