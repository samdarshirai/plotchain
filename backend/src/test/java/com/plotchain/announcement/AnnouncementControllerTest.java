package com.plotchain.announcement;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
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

    private org.springframework.test.web.servlet.ResultActions compose(String content) throws Exception {
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
            .andExpect(jsonPath("$.publishedAt").value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.startsWith("2000"))));
        org.mockito.ArgumentCaptor<Announcement> c = org.mockito.ArgumentCaptor.forClass(Announcement.class);
        verify(announcementRepository).save(c.capture());
        org.assertj.core.api.Assertions.assertThat(c.getValue().getAudience()).isEqualTo("ALL");
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
}
