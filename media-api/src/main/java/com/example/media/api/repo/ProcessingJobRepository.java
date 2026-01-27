package com.example.media.api.repo;

import com.example.media.api.domain.ProcessingJob;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ProcessingJobRepository extends JpaRepository<ProcessingJob, UUID> {
    Optional<ProcessingJob> findFirstByMediaIdOrderByStartedAtDesc(UUID mediaId);
}
