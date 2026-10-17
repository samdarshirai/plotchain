package com.plotchain.news;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface NewsRepository extends JpaRepository<News, UUID> {
    List<News> findAllByOrderByNewsDateDescCreatedAtDesc();
}
