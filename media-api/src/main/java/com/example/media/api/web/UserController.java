package com.example.media.api.web;

import com.example.media.api.service.UserService;
import com.example.media.api.web.dto.ChangePasswordRequest;
import com.example.media.api.web.dto.UpdateProfileRequest;
import com.example.media.api.web.dto.ProfileResponse;
import com.example.media.api.web.dto.DeleteAccountRequest;
import com.example.media.api.web.dto.AuthResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping("/me/password")
    public ResponseEntity<AuthResponse> changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        UUID userId = (UUID) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        AuthResponse response = userService.changePassword(userId, request);
        return ResponseEntity.ok(response);
    }

    @PatchMapping("/me")
    public ResponseEntity<AuthResponse> updateProfile(@Valid @RequestBody UpdateProfileRequest request) {
        UUID userId = (UUID) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        AuthResponse response = userService.updateProfile(userId, request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/me")
    public ResponseEntity<Void> deleteAccount(@Valid @RequestBody DeleteAccountRequest request) {
        UUID userId = (UUID) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        userService.deleteAccount(userId, request);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public ResponseEntity<ProfileResponse> getProfile() {
        UUID userId = (UUID) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return ResponseEntity.ok(userService.getProfile(userId));
    }
}
