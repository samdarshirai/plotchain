package com.plotchain.projects;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

@RestController
@RequestMapping("/api/company/projects")
public class PlotCsvController {

    private final PlotCsvService plotCsvService;

    public PlotCsvController(PlotCsvService plotCsvService) {
        this.plotCsvService = plotCsvService;
    }

    @GetMapping(value = "/plots/csv-template", produces = "text/csv")
    public ResponseEntity<byte[]> csvTemplate() {
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType("text/csv"))
            .body(plotCsvService.generateTemplate());
    }

    @PostMapping("/{projectId}/plots/csv/validate")
    public CsvValidationResponse validate(@PathVariable UUID projectId, @RequestParam("file") MultipartFile file) {
        return plotCsvService.validate(projectId, file);
    }

    @PostMapping("/{projectId}/plots/csv/commit")
    public ResponseEntity<Void> commit(@PathVariable UUID projectId, @RequestParam("file") MultipartFile file) {
        plotCsvService.commit(projectId, file);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }
}
