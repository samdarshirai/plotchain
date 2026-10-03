package com.plotchain.projects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigInteger;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class PlotGridService {

    private static final Pattern CHUNK = Pattern.compile("\\d+|\\D+");

    private final PlotRepository plotRepository;
    private final ProjectRepository projectRepository;

    public PlotGridService(PlotRepository plotRepository, ProjectRepository projectRepository) {
        this.plotRepository = plotRepository;
        this.projectRepository = projectRepository;
    }

    // ponytail: unpaginated -- one project's plots are bounded (hundreds, low thousands). Past ~5,000
    // plots per project add paging or a DB-side sort. Two queries total (exists + list), no per-row lookups.
    @Transactional(readOnly = true)
    public List<PlotGridResponse> grid(UUID projectId) {
        if (!projectRepository.existsById(projectId)) {
            throw new ProjectNotFoundException(projectId);
        }
        return plotRepository.findByProjectId(projectId).stream()
            .sorted(Comparator.comparing(Plot::getPlotNo, PlotGridService::compareNatural))
            .map(p -> new PlotGridResponse(p.getId(), p.getPlotNo(), p.getPlotType(),
                p.getAreaSqft(), p.getPrice(), p.getStatus()))
            .toList();
    }

    // Digit runs compare numerically, text runs case-insensitively, digits sort before text; a final
    // plain compareTo makes the order total and stable ("A-02" vs "A-2", and shorter prefix first).
    static int compareNatural(String a, String b) {
        Matcher ma = CHUNK.matcher(a);
        Matcher mb = CHUNK.matcher(b);
        while (ma.find() && mb.find()) {
            String x = ma.group();
            String y = mb.group();
            boolean dx = Character.isDigit(x.charAt(0));
            boolean dy = Character.isDigit(y.charAt(0));
            int c;
            if (dx && dy) {
                c = new BigInteger(x).compareTo(new BigInteger(y));
            } else if (dx != dy) {
                c = dx ? -1 : 1;
            } else {
                c = x.compareToIgnoreCase(y);
            }
            if (c != 0) {
                return c;
            }
        }
        return a.compareTo(b);
    }
}
