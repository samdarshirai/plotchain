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

    @GetMapping("/{associateId}")
    public TreeNodeResponse subtree(@PathVariable UUID associateId, @RequestParam(defaultValue = "3") int depth) {
        depth = Math.max(0, Math.min(depth, 5));
        return treeExplorerService.subtree(associateId, depth);
    }

    @GetMapping("/search")
    public TreeSearchResponse search(@RequestParam String q) {
        return treeExplorerService.search(q);
    }
}
