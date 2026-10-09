package com.plotchain.announcement;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AnnouncementServiceTest {

    @Mock AnnouncementRepository announcementRepository;

    @Test
    void composePublishesNowToEveryoneAndReturnsTheStoredRow() {
        when(announcementRepository.save(any(Announcement.class))).thenAnswer(i -> i.getArgument(0));
        AnnouncementService service = new AnnouncementService(announcementRepository);
        Instant before = Instant.now().minus(1, ChronoUnit.SECONDS);

        AnnouncementResponse response = service.compose(new CreateAnnouncementRequest("  Holiday  ", "Office closed\nMonday"));

        ArgumentCaptor<Announcement> saved = ArgumentCaptor.forClass(Announcement.class);
        verify(announcementRepository).save(saved.capture());
        Announcement a = saved.getValue();
        assertThat(a.getId()).isNotNull();
        assertThat(a.getAudience()).isEqualTo("ALL");
        assertThat(a.getPublishedAt()).isBetween(before, Instant.now().plus(1, ChronoUnit.SECONDS));
        // verbatim: no trimming or truncation
        assertThat(a.getTitle()).isEqualTo("  Holiday  ");
        assertThat(a.getBody()).isEqualTo("Office closed\nMonday");
        assertThat(response).isEqualTo(AnnouncementResponse.of(a));
    }

    @Test
    void feedMapsRowsToResponsesAndEchoesPagingWithoutAudience() {
        Announcement a = new Announcement(UUID.randomUUID(), "T", "B", Instant.parse("2031-01-01T00:00:00Z"), "ALL");
        when(announcementRepository.findAllByOrderByPublishedAtDesc(PageRequest.of(2, 5)))
            .thenReturn(new PageImpl<>(List.of(a), PageRequest.of(2, 5), 11));

        AnnouncementPageResponse page = new AnnouncementService(announcementRepository).feed(2, 5);

        assertThat(page.entries()).containsExactly(AnnouncementResponse.of(a));
        assertThat(page.page()).isEqualTo(2);
        assertThat(page.size()).isEqualTo(5);
        assertThat(page.totalElements()).isEqualTo(11);
    }

    @Test
    void emptyFeedIsAnEmptyPageNotAnError() {
        when(announcementRepository.findAllByOrderByPublishedAtDesc(PageRequest.of(0, 20)))
            .thenReturn(new PageImpl<>(List.of()));

        AnnouncementPageResponse page = new AnnouncementService(announcementRepository).feed(0, 20);

        assertThat(page.entries()).isEmpty();
        assertThat(page.totalElements()).isZero();
    }
}
