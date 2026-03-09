package com.example.media.api.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public class ProfileResponse {
    private UUID id;
    private String username;
    private String email;
    private OffsetDateTime createdAt;

    public ProfileResponse(UUID id, String username, String email, OffsetDateTime createdAt) {
        this.id = id;
        this.username = username;
        this.email = email;
        this.createdAt = createdAt;
    }

    public UUID getId() { return id; }
    public String getUsername() { return username; }
    public String getEmail() { return email; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}