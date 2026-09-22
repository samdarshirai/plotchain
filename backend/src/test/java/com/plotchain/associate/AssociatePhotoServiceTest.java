package com.plotchain.associate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssociatePhotoServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock AssociatePhotoRepository associatePhotoRepository;

    AssociatePhotoService service;
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new AssociatePhotoService(associateRepository, associatePhotoRepository);
    }

    private Associate seededAssociate() {
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setRole(AssociateRole.ASSOCIATE);
        return a;
    }

    @Test
    void uploadPhotoSavesTheFileBytesAndContentType() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(seededAssociate()));
        when(associatePhotoRepository.findByAssociateId(ASSOCIATE_ID)).thenReturn(Optional.empty());
        when(associatePhotoRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        MockMultipartFile file = new MockMultipartFile("file", "photo.png", "image/png", new byte[]{1, 2, 3});

        service.uploadPhoto(ASSOCIATE_ID, file);

        org.mockito.ArgumentCaptor<AssociatePhoto> captor = org.mockito.ArgumentCaptor.forClass(AssociatePhoto.class);
        verify(associatePhotoRepository).save(captor.capture());
        assertThat(captor.getValue().getContent()).isEqualTo(new byte[]{1, 2, 3});
        assertThat(captor.getValue().getContentType()).isEqualTo("image/png");
    }

    @Test
    void uploadPhotoRejectsAnEmptyFile() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(seededAssociate()));
        MockMultipartFile file = new MockMultipartFile("file", "photo.png", "image/png", new byte[]{});

        assertThatThrownBy(() -> service.uploadPhoto(ASSOCIATE_ID, file))
            .isInstanceOf(InvalidPhotoUploadException.class);
        verify(associatePhotoRepository, never()).save(any());
    }

    @Test
    void uploadPhotoRejectsAnUnsupportedContentType() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(seededAssociate()));
        MockMultipartFile file = new MockMultipartFile("file", "id.pdf", "application/pdf", new byte[]{1});

        assertThatThrownBy(() -> service.uploadPhoto(ASSOCIATE_ID, file))
            .isInstanceOf(InvalidPhotoUploadException.class);
        verify(associatePhotoRepository, never()).save(any());
    }

    @Test
    void getPhotoReturnsEmptyWhenNoneUploaded() {
        when(associatePhotoRepository.findByAssociateId(ASSOCIATE_ID)).thenReturn(Optional.empty());

        assertThat(service.getPhoto(ASSOCIATE_ID)).isEmpty();
    }

    @Test
    void removePhotoDeletesTheRow() {
        service.removePhoto(ASSOCIATE_ID);

        verify(associatePhotoRepository).deleteByAssociateId(ASSOCIATE_ID);
    }
}
