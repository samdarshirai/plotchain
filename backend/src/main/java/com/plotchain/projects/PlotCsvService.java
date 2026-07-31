package com.plotchain.projects;

import com.plotchain.company.SettingsAuditService;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

// Two-phase CSV import: validate() parses and checks every row without ever calling
// plotRepository.save, so an admin can fix mistakes before anything is committed. commit()
// re-runs the identical validation and only inserts if the file is entirely clean -- an
// import can never leave a project half-populated.
@Service
public class PlotCsvService {

    private static final String HEADER_ROW = "plot_no,plot_type,area_sqft,rate,price,status\n";
    private static final Set<String> VALID_PLOT_TYPES = Set.of("NORMAL", "CORNER");
    private static final Set<String> VALID_STATUSES = Set.of("AVAILABLE", "BOOKED", "SOLD");

    private final PlotRepository plotRepository;
    private final SettingsAuditService settingsAuditService;

    public PlotCsvService(PlotRepository plotRepository, SettingsAuditService settingsAuditService) {
        this.plotRepository = plotRepository;
        this.settingsAuditService = settingsAuditService;
    }

    public byte[] generateTemplate() {
        return HEADER_ROW.getBytes(StandardCharsets.UTF_8);
    }

    public CsvValidationResponse validate(UUID projectId, MultipartFile file) {
        List<CSVRecord> rows = parseRows(file);
        List<CsvRowError> errors = validateRows(projectId, rows);
        int errorRowCount = (int) errors.stream().map(CsvRowError::rowNumber).distinct().count();
        return new CsvValidationResponse(rows.size(), rows.size() - errorRowCount, errors);
    }

    @Transactional
    public void commit(UUID projectId, MultipartFile file, UUID actorId) {
        List<CSVRecord> rows = parseRows(file);
        List<CsvRowError> errors = validateRows(projectId, rows);
        if (!errors.isEmpty()) {
            throw new CsvImportRejectedException(errors);
        }
        for (CSVRecord row : rows) {
            String status = row.get("status");
            plotRepository.save(new Plot(
                UUID.randomUUID(),
                projectId,
                row.get("plot_no"),
                PlotType.valueOf(row.get("plot_type")),
                new BigDecimal(row.get("area_sqft")),
                new BigDecimal(row.get("rate")),
                new BigDecimal(row.get("price")),
                (status == null || status.isBlank()) ? PlotStatus.AVAILABLE : PlotStatus.valueOf(status)
            ));
        }
        int rowCount = rows.size();
        settingsAuditService.record("PROJECTS", "Bulk-imported " + rowCount + " plots via CSV",
            Map.of("projectId", projectId, "rowCount", rowCount), actorId);
    }

    private List<CsvRowError> validateRows(UUID projectId, List<CSVRecord> rows) {
        Set<String> distinctPlotNos = new LinkedHashSet<>();
        for (CSVRecord row : rows) {
            String plotNo = row.get("plot_no");
            if (plotNo != null && !plotNo.isBlank()) {
                distinctPlotNos.add(plotNo);
            }
        }
        Set<String> alreadyInProject = plotRepository
            .findAllByProjectIdAndPlotNoIn(projectId, List.copyOf(distinctPlotNos))
            .stream()
            .map(Plot::getPlotNo)
            .collect(java.util.stream.Collectors.toSet());

        List<CsvRowError> errors = new ArrayList<>();
        Set<String> seenSoFar = new LinkedHashSet<>();
        for (CSVRecord row : rows) {
            int rowNumber = (int) row.getRecordNumber();
            String plotNo = row.get("plot_no");
            if (plotNo == null || plotNo.isBlank()) {
                errors.add(new CsvRowError(rowNumber, "plot_no", "plot_no is required"));
            } else if (seenSoFar.contains(plotNo)) {
                errors.add(new CsvRowError(rowNumber, "plot_no", "duplicate plot_no within the file: " + plotNo));
            } else if (alreadyInProject.contains(plotNo)) {
                errors.add(new CsvRowError(rowNumber, "plot_no", "plot_no already exists in this project: " + plotNo));
            } else {
                seenSoFar.add(plotNo);
            }

            String plotType = row.get("plot_type");
            if (plotType == null || !VALID_PLOT_TYPES.contains(plotType)) {
                errors.add(new CsvRowError(rowNumber, "plot_type", "plot_type must be NORMAL or CORNER"));
            }

            validatePositiveDecimal(row, "area_sqft", rowNumber, errors);
            validatePositiveDecimal(row, "rate", rowNumber, errors);
            validatePositiveDecimal(row, "price", rowNumber, errors);

            String status = row.get("status");
            if (status != null && !status.isBlank() && !VALID_STATUSES.contains(status)) {
                errors.add(new CsvRowError(rowNumber, "status", "status must be AVAILABLE, BOOKED, or SOLD"));
            }
        }
        return errors;
    }

    private static void validatePositiveDecimal(CSVRecord row, String field, int rowNumber, List<CsvRowError> errors) {
        String value = row.get(field);
        try {
            if (new BigDecimal(value).signum() <= 0) {
                errors.add(new CsvRowError(rowNumber, field, field + " must be a positive number"));
            }
        } catch (NumberFormatException | NullPointerException e) {
            errors.add(new CsvRowError(rowNumber, field, field + " must be a positive number"));
        }
    }

    private static List<CSVRecord> parseRows(MultipartFile file) {
        CSVFormat format = CSVFormat.Builder.create(CSVFormat.DEFAULT)
            .setHeader()
            .setSkipHeaderRecord(true)
            .setTrim(true)
            .build();
        try (Reader reader = new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8);
             CSVParser parser = CSVParser.parse(reader, format)) {
            return parser.getRecords();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
