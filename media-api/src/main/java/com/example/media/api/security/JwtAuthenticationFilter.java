package com.example.media.api.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.ArrayList;
import java.util.UUID;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationFilter.class);
    
    private final JwtUtil jwtUtil;
    
    public JwtAuthenticationFilter(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        return path.startsWith("/api/auth/") || path.startsWith("/actuator/");
    }
    
    @Override
    protected void doFilterInternal(HttpServletRequest request, 
                                    HttpServletResponse response, 
                                    FilterChain filterChain) throws ServletException, IOException {
        
        String authHeader = request.getHeader("Authorization");

        if (authHeader != null) {
            String trimmed = authHeader.trim();
            if (trimmed.regionMatches(true, 0, "Bearer ", 0, 7)) {
                String token = trimmed.substring(7).trim();

                if (token.length() >= 2) {
                    if ((token.startsWith("\"") && token.endsWith("\""))
                            || (token.startsWith("'") && token.endsWith("'"))) {
                        token = token.substring(1, token.length() - 1).trim();
                    }
                }

                if (token.isEmpty()) {
                    log.debug("Empty Bearer token for {} {}", request.getMethod(), request.getRequestURI());
                } else {
                    try {
                        UUID userId = jwtUtil.getUserIdFromToken(token);
                        UsernamePasswordAuthenticationToken authentication =
                                new UsernamePasswordAuthenticationToken(userId, null, new ArrayList<>());
                        authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                        SecurityContextHolder.getContext().setAuthentication(authentication);
                    } catch (Exception e) {
                        log.warn("JWT rejected for {} {}: {}", request.getMethod(), request.getRequestURI(), e.getClass().getSimpleName());
                    }
                }
            } else {
                log.debug("Non-Bearer Authorization header for {} {}", request.getMethod(), request.getRequestURI());
            }
        }
        
        filterChain.doFilter(request, response);
    }
}