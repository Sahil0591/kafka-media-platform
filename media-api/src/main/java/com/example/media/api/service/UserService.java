package com.example.media.api.service;

import com.example.media.api.domain.Media;
import com.example.media.api.domain.User;
import com.example.media.api.repo.MediaRepository;
import com.example.media.api.repo.UserRepository;
import com.example.media.api.security.JwtUtil;
import com.example.media.api.web.dto.AuthResponse;
import com.example.media.api.web.dto.ChangePasswordRequest;
import com.example.media.api.web.dto.DeleteAccountRequest;
import com.example.media.api.web.dto.ProfileResponse;
import com.example.media.api.web.dto.UpdateProfileRequest;
import io.minio.ListObjectsArgs;
import io.minio.MinioClient;
import io.minio.RemoveObjectArgs;
import io.minio.Result;
import io.minio.messages.Item;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class UserService {

    private static final Logger log = LoggerFactory.getLogger(UserService.class);

    private final UserRepository userRepository;
    private final MediaRepository mediaRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final MinioClient minioClient;
    private final String bucket;

    public UserService(UserRepository userRepository,
                       MediaRepository mediaRepository,
                       PasswordEncoder passwordEncoder,
                       JwtUtil jwtUtil,
                       MinioClient minioClient,
                       @Value("${app.minio.bucket}") String bucket) {
        this.userRepository = userRepository;
        this.mediaRepository = mediaRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
        this.minioClient = minioClient;
        this.bucket = bucket;
    }

    @Transactional
    public AuthResponse changePassword(UUID userId, ChangePasswordRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPasswordHash())) {
            throw new IllegalArgumentException("Current password is incorrect");
        }

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        user.setUpdatedAt(OffsetDateTime.now());
        userRepository.save(user);

        String token = jwtUtil.generateToken(user.getId(), user.getUsername());
        return new AuthResponse(token, user.getUsername(), user.getEmail());
    }

    @Transactional
    public AuthResponse updateProfile(UUID userId, UpdateProfileRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (request.getUsername() != null && !request.getUsername().equals(user.getUsername())) {
            if (userRepository.existsByUsername(request.getUsername())) {
                throw new IllegalArgumentException("Username already taken");
            }
            user.setUsername(request.getUsername());
        }

        if (request.getEmail() != null && !request.getEmail().equals(user.getEmail())) {
            if (userRepository.existsByEmail(request.getEmail())) {
                throw new IllegalArgumentException("Email already taken");
            }
            user.setEmail(request.getEmail());
        }

        user.setUpdatedAt(OffsetDateTime.now());
        userRepository.save(user);

        String token = jwtUtil.generateToken(user.getId(), user.getUsername());
        return new AuthResponse(token, user.getUsername(), user.getEmail());
    }

    public ProfileResponse getProfile(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        return new ProfileResponse(user.getId(), user.getUsername(), user.getEmail(), user.getCreatedAt());
    }

    @Transactional
    public void deleteAccount(UUID userId, DeleteAccountRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new IllegalArgumentException("Password is incorrect");
        }

        List<Media> userMedia = mediaRepository.findByOwnerId(userId);
        for (Media media : userMedia) {
            if (media.getRawObjectKey() != null) {
                try {
                    minioClient.removeObject(
                        RemoveObjectArgs.builder().bucket(bucket).object(media.getRawObjectKey()).build()
                    );
                } catch (Exception e) {
                    log.warn("Failed to delete raw object: {}", e.getMessage());
                }
            }
            deleteMinioPrefix("hls/" + media.getId() + "/");
        }

        userRepository.delete(user);
    }

    private void deleteMinioPrefix(String prefix) {
        Iterable<Result<Item>> objects = minioClient.listObjects(
            ListObjectsArgs.builder().bucket(bucket).prefix(prefix).recursive(true).build()
        );
        for (Result<Item> result : objects) {
            try {
                String key = result.get().objectName();
                minioClient.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(key).build());
            } catch (Exception e) {
                log.warn("Failed to delete MinIO object under prefix '{}': {}", prefix, e.getMessage());
            }
        }
    }
}
