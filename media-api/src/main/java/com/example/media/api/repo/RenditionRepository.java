package com.example.media.api.repo;

import com.example.media.api.domain.Rendition;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RenditionRepository extends JpaRepository<Rendition, UUID> {
    List<Rendition> findByMediaId(UUID mediaId);
}
