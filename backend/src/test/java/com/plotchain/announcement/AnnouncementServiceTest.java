package com.plotchain.announcement;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

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
}
