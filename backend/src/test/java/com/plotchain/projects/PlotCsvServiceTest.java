package com.plotchain.projects;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.company.SettingsAuditLog;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlotCsvServiceTest {

    @Mock PlotRepository plotRepository;
    // SettingsAuditService is a concrete class -- a real instance is built over mocked
    // (interface) repositories per the repo's established pattern (see CompanyProfileServiceTest).
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;
    @Mock AssociateRepository associateRepository;

    PlotCsvService plotCsvService;

    private static final UUID PROJECT_ID = UUID.randomUUID();
    private static final UUID ACTOR_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        plotCsvService = new PlotCsvService(plotRepository, settingsAuditService);
    }

    private MockMultipartFile csvFile(String content) {
        return new MockMultipartFile("file", "plots.csv", "text/csv", content.getBytes(StandardCharsets.UTF_8));
    }

    private static final String HEADER = "plot_no,plot_type,area_sqft,rate,price,status\n";

    @Test
    void generateTemplateReturnsOnlyTheHeaderRow() {
        byte[] template = plotCsvService.generateTemplate();

        assertThat(new String(template, StandardCharsets.UTF_8)).isEqualTo(HEADER);
    }

    @Test
    void validateReturnsZeroErrorsForACleanFile() {
        when(plotRepository.findAllByProjectIdAndPlotNoIn(PROJECT_ID, List.of("A-101"))).thenReturn(List.of());
        MockMultipartFile file = csvFile(HEADER + "A-101,NORMAL,1200,500,600000,AVAILABLE\n");

        CsvValidationResponse response = plotCsvService.validate(PROJECT_ID, file);

        assertThat(response.totalRows()).isEqualTo(1);
        assertThat(response.validRows()).isEqualTo(1);
        assertThat(response.errors()).isEmpty();
        verify(plotRepository, never()).save(any());
    }

    @Test
    void validateFlagsAMissingRequiredField() {
        MockMultipartFile file = csvFile(HEADER + ",NORMAL,1200,500,600000,AVAILABLE\n");

        CsvValidationResponse response = plotCsvService.validate(PROJECT_ID, file);

        assertThat(response.errors()).hasSize(1);
        assertThat(response.errors().get(0).rowNumber()).isEqualTo(1);
        assertThat(response.errors().get(0).field()).isEqualTo("plot_no");
    }

    @Test
    void validateFlagsAnInvalidPlotType() {
        MockMultipartFile file = csvFile(HEADER + "A-101,DIAMOND,1200,500,600000,AVAILABLE\n");

        CsvValidationResponse response = plotCsvService.validate(PROJECT_ID, file);

        assertThat(response.errors()).hasSize(1);
        assertThat(response.errors().get(0).field()).isEqualTo("plot_type");
    }

    @Test
    void validateFlagsANonNumericArea() {
        MockMultipartFile file = csvFile(HEADER + "A-101,NORMAL,abc,500,600000,AVAILABLE\n");

        CsvValidationResponse response = plotCsvService.validate(PROJECT_ID, file);

        assertThat(response.errors()).hasSize(1);
        assertThat(response.errors().get(0).field()).isEqualTo("area_sqft");
    }

    @Test
    void validateFlagsADuplicatePlotNoWithinTheFileItself() {
        MockMultipartFile file = csvFile(HEADER
            + "A-101,NORMAL,1200,500,600000,AVAILABLE\n"
            + "A-101,CORNER,1300,550,715000,AVAILABLE\n");

        CsvValidationResponse response = plotCsvService.validate(PROJECT_ID, file);

        assertThat(response.errors()).hasSize(1);
        assertThat(response.errors().get(0).rowNumber()).isEqualTo(2);
        assertThat(response.errors().get(0).field()).isEqualTo("plot_no");
    }

    @Test
    void validateFlagsAPlotNoThatAlreadyExistsInTheProject() {
        Plot existing = new Plot(UUID.randomUUID(), PROJECT_ID, "A-101", PlotType.NORMAL,
            new java.math.BigDecimal("1"), new java.math.BigDecimal("1"), new java.math.BigDecimal("1"), PlotStatus.AVAILABLE);
        when(plotRepository.findAllByProjectIdAndPlotNoIn(PROJECT_ID, List.of("A-101"))).thenReturn(List.of(existing));
        MockMultipartFile file = csvFile(HEADER + "A-101,NORMAL,1200,500,600000,AVAILABLE\n");

        CsvValidationResponse response = plotCsvService.validate(PROJECT_ID, file);

        assertThat(response.errors()).hasSize(1);
        assertThat(response.errors().get(0).field()).isEqualTo("plot_no");
    }

    @Test
    void commitThrowsAndPersistsNothingWhenAnyRowHasAnError() {
        MockMultipartFile file = csvFile(HEADER + "A-101,DIAMOND,1200,500,600000,AVAILABLE\n");

        assertThatThrownBy(() -> plotCsvService.commit(PROJECT_ID, file, ACTOR_ID))
            .isInstanceOf(CsvImportRejectedException.class);

        verify(plotRepository, never()).save(any());
    }

    @Test
    void commitSavesEveryRowWhenTheFileIsClean() {
        when(plotRepository.findAllByProjectIdAndPlotNoIn(PROJECT_ID, List.of("A-101", "A-102"))).thenReturn(List.of());
        MockMultipartFile file = csvFile(HEADER
            + "A-101,NORMAL,1200,500,600000,AVAILABLE\n"
            + "A-102,CORNER,1300,550,715000,\n");

        plotCsvService.commit(PROJECT_ID, file, ACTOR_ID);

        verify(plotRepository, times(2)).save(any());
    }

    @Test
    void commitRecordsAnAuditEntryWithTheRowCount() {
        when(plotRepository.findAllByProjectIdAndPlotNoIn(PROJECT_ID, List.of("A-101", "A-102"))).thenReturn(List.of());
        MockMultipartFile file = csvFile(HEADER
            + "A-101,NORMAL,1200,500,600000,AVAILABLE\n"
            + "A-102,CORNER,1300,550,715000,\n");

        plotCsvService.commit(PROJECT_ID, file, ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("PROJECTS");
        assertThat(saved.getSummary()).isEqualTo("Bulk-imported 2 plots via CSV");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(saved.getDetail()).contains("\"projectId\":\"" + PROJECT_ID + "\"")
            .contains("\"rowCount\":2");
    }

    @Test
    void commitDoesNotRecordAnAuditEntryWhenValidationFails() {
        MockMultipartFile file = csvFile(HEADER + "A-101,DIAMOND,1200,500,600000,AVAILABLE\n");

        assertThatThrownBy(() -> plotCsvService.commit(PROJECT_ID, file, ACTOR_ID))
            .isInstanceOf(CsvImportRejectedException.class);

        verify(settingsAuditLogRepository, never()).save(any());
    }
}
