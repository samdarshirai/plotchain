package com.plotchain.announcement;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AnnouncementControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @Autowired ObjectMapper objectMapper;

    @MockBean AssociateRepository associateRepository;
    @MockBean AnnouncementRepository announcementRepository;

    @BeforeEach
    void stubSave() {
        when(announcementRepository.save(any(Announcement.class))).thenAnswer(i -> i.getArgument(0));
    }

    private String tokenFor(AssociateRole role) {
        Associate principal = new Associate();
        principal.setId(UUID.randomUUID());
        principal.setRole(role);
        when(associateRepository.findById(principal.getId())).thenReturn(Optional.of(principal));
        return "Bearer " + jwtService.generateToken(principal);
    }

    private String json(String title, String body) throws Exception {
        Map<String, Object> m = new HashMap<>();
        if (title != null) m.put("title", title);
        if (body != null) m.put("body", body);
        return objectMapper.writeValueAsString(m);
    }

    private ResultActions compose(String content) throws Exception {
        return mockMvc.perform(post("/api/admin/announcements")
            .header("Authorization", tokenFor(AssociateRole.ADMIN))
            .contentType("application/json").content(content));
    }

    @Test
    void adminComposeReturns201WithTheLiveAnnouncement() throws Exception {
        compose(json("Holiday", "Office closed Monday"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").exists())
            .andExpect(jsonPath("$.title").value("Holiday"))
            .andExpect(jsonPath("$.body").value("Office closed Monday"))
            .andExpect(jsonPath("$.publishedAt").exists())
            .andExpect(jsonPath("$.audience").doesNotExist());
    }

    @Test
    void clientSuppliedAudienceAndPublishedAtAreIgnored() throws Exception {
        compose("{\"title\":\"t\",\"body\":\"b\",\"audience\":\"VIP\",\"publishedAt\":\"2000-01-01T00:00:00Z\"}")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.publishedAt").value(not(startsWith("2000"))));
        ArgumentCaptor<Announcement> c = ArgumentCaptor.forClass(Announcement.class);
        verify(announcementRepository).save(c.capture());
        assertThat(c.getValue().getAudience()).isEqualTo("ALL");
    }

    @Test
    void titleOf300CharsIsAccepted() throws Exception {
        compose(json("x".repeat(300), "b")).andExpect(status().isCreated());
    }

    @Test
    void titleOver300CharsIs400NotA500() throws Exception {
        compose(json("x".repeat(301), "b"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fields.title").exists());
        verify(announcementRepository, never()).save(any());
    }

    @Test
    void blankOrMissingTitleIs400() throws Exception {
        compose(json("   ", "b")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.fields.title").exists());
        compose(json(null, "b")).andExpect(status().isBadRequest());
        verify(announcementRepository, never()).save(any());
    }

    @Test
    void blankOrMissingBodyIs400() throws Exception {
        compose(json("t", "")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.fields.body").exists());
        compose(json("t", null)).andExpect(status().isBadRequest());
        verify(announcementRepository, never()).save(any());
    }

    private Announcement row(String title, String publishedAt) {
        return new Announcement(UUID.randomUUID(), title, "Body of " + title, Instant.parse(publishedAt), "ALL");
    }

    private void stubFeed(PageRequest expected, List<Announcement> rows, long total) {
        when(announcementRepository.findAllByOrderByPublishedAtDesc(eq(expected)))
            .thenReturn(new PageImpl<>(rows, expected, total));
    }

    @Test
    void feedReturnsPageShapeInRepositoryOrderForAnAssociateAndHidesAudience() throws Exception {
        stubFeed(PageRequest.of(0, 20),
            List.of(row("Newer", "2031-02-01T00:00:00Z"), row("Older", "2031-01-01T00:00:00Z")), 2);

        mockMvc.perform(get("/api/announcements").header("Authorization", tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries.length()").value(2))
            .andExpect(jsonPath("$.entries[0].title").value("Newer"))
            .andExpect(jsonPath("$.entries[1].title").value("Older"))
            .andExpect(jsonPath("$.entries[0].body").value("Body of Newer"))
            .andExpect(jsonPath("$.entries[0].publishedAt").exists())
            .andExpect(jsonPath("$.entries[0].id").exists())
            .andExpect(jsonPath("$.entries[0].audience").doesNotExist())
            .andExpect(jsonPath("$.page").value(0))
            .andExpect(jsonPath("$.size").value(20))
            .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void adminReadsTheSameFeed() throws Exception {
        stubFeed(PageRequest.of(0, 20), List.of(row("Only", "2031-01-01T00:00:00Z")), 1);

        mockMvc.perform(get("/api/announcements").header("Authorization", tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].title").value("Only"));
    }

    @Test
    void emptyFeedIs200WithEmptyEntries() throws Exception {
        stubFeed(PageRequest.of(0, 20), List.of(), 0);

        mockMvc.perform(get("/api/announcements").header("Authorization", tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries.length()").value(0))
            .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void pageAndSizeArePassedThrough() throws Exception {
        stubFeed(PageRequest.of(3, 10), List.of(), 40);

        mockMvc.perform(get("/api/announcements").param("page", "3").param("size", "10")
                .header("Authorization", tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.page").value(3))
            .andExpect(jsonPath("$.size").value(10));
    }

    @Test
    void oversizedSizeIsCappedAt100() throws Exception {
        stubFeed(PageRequest.of(0, 100), List.of(), 0);

        mockMvc.perform(get("/api/announcements").param("size", "100000")
                .header("Authorization", tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.size").value(100));
    }

    @Test
    void zeroOrNegativeSizeIsRaisedToOneNotA500() throws Exception {
        stubFeed(PageRequest.of(0, 1), List.of(), 0);

        mockMvc.perform(get("/api/announcements").param("size", "0")
                .header("Authorization", tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.size").value(1));
        mockMvc.perform(get("/api/announcements").param("size", "-5")
                .header("Authorization", tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.size").value(1));
    }

    @Test
    void negativePageIsFlooredToZeroNotA500() throws Exception {
        stubFeed(PageRequest.of(0, 20), List.of(), 0);

        mockMvc.perform(get("/api/announcements").param("page", "-1")
                .header("Authorization", tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.page").value(0));
    }

    @Test
    void nonNumericPageIsA4xxNotA500() throws Exception {
        mockMvc.perform(get("/api/announcements").param("page", "abc")
                .header("Authorization", tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().is4xxClientError());
    }

    @Test
    void feedWithoutATokenIs401() throws Exception {
        mockMvc.perform(get("/api/announcements")).andExpect(status().isUnauthorized());
    }
}
