package com.plotchain.company;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class SettingsAuditService {
    private static final String ADMIN_USERS_SECTION = "ADMIN_USERS";
    private final SettingsAuditLogRepository settingsAuditLogRepository;
    private final AssociateRepository associateRepository;
    private final ObjectMapper objectMapper;

    public SettingsAuditService(SettingsAuditLogRepository settingsAuditLogRepository,
                                 AssociateRepository associateRepository,
                                 ObjectMapper objectMapper) {
        this.settingsAuditLogRepository = settingsAuditLogRepository;
        this.associateRepository = associateRepository;
        this.objectMapper = objectMapper;
    }

    public void record(String section, String summary, Object detail, UUID actorId) {
        settingsAuditLogRepository.save(new SettingsAuditLog(
            UUID.randomUUID(), actorId, section, summary, toJson(detail), Instant.now()));
    }

    public SettingsAuditPageResponse list(String section, int page, int size) {
        return list(section, page, size, false);
    }

    /** hideAdminUsers: MANAGER viewers never see ADMIN_USERS entries (they name ADMIN accounts). */
    public SettingsAuditPageResponse list(String section, int page, int size, boolean hideAdminUsers) {
        PageRequest pageRequest = PageRequest.of(page, size);
        Page<SettingsAuditLog> result;
        if (section == null || section.isBlank()) {
            result = hideAdminUsers
                ? settingsAuditLogRepository.findAllBySectionNotOrderByChangedAtDesc(ADMIN_USERS_SECTION, pageRequest)
                : settingsAuditLogRepository.findAllByOrderByChangedAtDesc(pageRequest);
        } else if (hideAdminUsers && ADMIN_USERS_SECTION.equals(section)) {
            result = Page.empty(pageRequest);
        } else {
            result = settingsAuditLogRepository.findAllBySectionOrderByChangedAtDesc(section, pageRequest);
        }

        Map<UUID, Associate> actorsById = associateRepository.findAllById(
            result.getContent().stream()
                .map(SettingsAuditLog::getChangedByAssociateId)
                .filter(Objects::nonNull)
                .distinct()
                .toList()
        ).stream().collect(Collectors.toMap(Associate::getId, a -> a));

        List<SettingsAuditEntryResponse> entries = result.getContent().stream()
            .map(entry -> toResponse(entry, actorsById.get(entry.getChangedByAssociateId())))
            .toList();
        return new SettingsAuditPageResponse(entries, page, size, result.getTotalElements());
    }

    private String toJson(Object detail) {
        try {
            return objectMapper.writeValueAsString(detail);
        } catch (JsonProcessingException e) {
            throw new UncheckedIOException(new IOException(e));
        }
    }

    private static SettingsAuditEntryResponse toResponse(SettingsAuditLog entry, Associate actor) {
        return new SettingsAuditEntryResponse(
            entry.getId(),
            entry.getChangedByAssociateId(),
            actor != null ? actor.getName() : null,
            actor != null ? actor.getUserId() : null,
            entry.getSection(),
            entry.getSummary(),
            entry.getDetail(),
            entry.getChangedAt()
        );
    }
}
