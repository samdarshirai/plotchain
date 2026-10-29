package com.plotchain.tree;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/tree")
public class TreeExplorerController {

    private final TreeExplorerService treeExplorerService;

    public TreeExplorerController(TreeExplorerService treeExplorerService) {
        this.treeExplorerService = treeExplorerService;
    }

    @GetMapping
    public TreeNodeResponse companyTree() {
        return treeExplorerService.companyTree();
    }

    @GetMapping("/{associateId}")
    public TreeNodeResponse subtree(@PathVariable UUID associateId) {
        return treeExplorerService.subtree(associateId);
    }

    // Admin Tree Explorer hover details (see SecurityConfig for the ADMIN-only matcher this
    // nested route needs of its own -- the existing "/api/admin/tree/*" matcher only covers one
    // path segment and does not cover "/{associateId}/details").
    @GetMapping("/{associateId}/details")
    public TreeNodeDetailsResponse nodeDetails(@PathVariable UUID associateId) {
        return treeExplorerService.nodeDetails(associateId);
    }

    @GetMapping("/search")
    public TreeSearchResponse search(@RequestParam String q) {
        return treeExplorerService.search(q);
    }
}
