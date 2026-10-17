package com.plotchain.news;

import com.plotchain.company.SettingsAuditService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class NewsService {

    private static final String AUDIT_SECTION = "NEWS";

    private final NewsRepository repository;
    private final SettingsAuditService auditService;

    public NewsService(NewsRepository repository, SettingsAuditService auditService) {
        this.repository = repository;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public List<NewsResponse> list() {
        return repository.findAllByOrderByNewsDateDescCreatedAtDesc().stream().map(NewsResponse::of).toList();
    }

    @Transactional
    public NewsResponse create(NewsRequest request, UUID actorId) {
        News news = new News(UUID.randomUUID(), request.newsDate(), request.title().trim(), request.body().trim());
        repository.save(news);
        auditService.record(AUDIT_SECTION, "Created news " + news.getTitle(), Map.of("id", news.getId().toString()), actorId);
        return NewsResponse.of(news);
    }
}
