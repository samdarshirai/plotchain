package com.plotchain.projects;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class PlotRepositoryTest {

    @Autowired ProjectRepository projectRepository;
    @Autowired PlotRepository plotRepository;
    @Autowired TestEntityManager entityManager;

    private Project persistProject() {
        Project project = new Project(UUID.randomUUID(), "Green Valley", "Hyderabad", null, null, Instant.now());
        entityManager.persist(project);
        return project;
    }

    private Plot newPlot(UUID projectId, String plotNo, PlotStatus status) {
        return new Plot(UUID.randomUUID(), projectId, plotNo, PlotType.NORMAL,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), status);
    }

    @Test
    void existsByProjectIdIsFalseForAProjectWithNoPlots() {
        Project project = persistProject();
        entityManager.flush();

        assertThat(plotRepository.existsByProjectId(project.getId())).isFalse();
    }

    @Test
    void existsByProjectIdIsTrueOnceAPlotIsSaved() {
        Project project = persistProject();
        plotRepository.save(newPlot(project.getId(), "A-101", PlotStatus.AVAILABLE));
        entityManager.flush();

        assertThat(plotRepository.existsByProjectId(project.getId())).isTrue();
    }

    @Test
    void findAllByProjectIdOnlyReturnsRowsForThatProject() {
        Project projectA = persistProject();
        Project projectB = persistProject();
        plotRepository.save(newPlot(projectA.getId(), "A-101", PlotStatus.AVAILABLE));
        plotRepository.save(newPlot(projectB.getId(), "B-101", PlotStatus.AVAILABLE));
        entityManager.flush();

        Pageable pageable = PageRequest.of(0, 20);
        List<Plot> plots = plotRepository.findAllByProjectId(projectA.getId(), pageable).getContent();

        assertThat(plots).extracting(Plot::getPlotNo).containsExactly("A-101");
    }

    @Test
    void findAllByProjectIdAndPlotNoInReturnsOnlyMatchingRows() {
        Project project = persistProject();
        plotRepository.save(newPlot(project.getId(), "A-101", PlotStatus.AVAILABLE));
        plotRepository.save(newPlot(project.getId(), "A-102", PlotStatus.AVAILABLE));
        entityManager.flush();

        List<Plot> plots = plotRepository.findAllByProjectIdAndPlotNoIn(project.getId(), List.of("A-102", "A-999"));

        assertThat(plots).extracting(Plot::getPlotNo).containsExactly("A-102");
    }

    @Test
    void countByProjectIdAndStatusCountsOnlyMatchingStatus() {
        Project project = persistProject();
        plotRepository.save(newPlot(project.getId(), "A-101", PlotStatus.AVAILABLE));
        plotRepository.save(newPlot(project.getId(), "A-102", PlotStatus.SOLD));
        entityManager.flush();

        assertThat(plotRepository.countByProjectIdAndStatus(project.getId(), PlotStatus.SOLD)).isEqualTo(1);
        assertThat(plotRepository.countByProjectId(project.getId())).isEqualTo(2);
    }
}
