package com.plotchain.news;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class NewsServiceTest {

    @Mock NewsRepository repository;
    @Mock SettingsAuditLogRepository auditLogRepository;
    @Mock AssociateRepository associateRepository;

    NewsService service;

    @BeforeEach
    void setUp() {
        SettingsAuditService audit = new SettingsAuditService(auditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        service = new NewsService(repository, audit);
    }

    @Test
    void createTrimsAndSaves() {
        NewsResponse r = service.create(new NewsRequest(LocalDate.of(2026, 10, 17), " Launch ", " Body "), UUID.randomUUID());
        assertThat(r.title()).isEqualTo("Launch");
        assertThat(r.body()).isEqualTo("Body");
        verify(repository).save(any(News.class));
    }
}
