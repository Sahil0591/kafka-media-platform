package com.example.media.api.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(MultipartException.class)
    public ResponseEntity<Map<String, Object>> handleMultipart(MultipartException ex) {
        Throwable cause = ex;
        while (cause.getCause() != null && cause.getCause() != cause) {
            cause = cause.getCause();
        }
        if (cause instanceof MaxUploadSizeExceededException) {
            return handleMaxUploadSizeExceeded((MaxUploadSizeExceededException) cause);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "BAD_MULTIPART_REQUEST");
        body.put("message", "Malformed multipart request.");
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> handleMaxUploadSizeExceeded(MaxUploadSizeExceededException ex) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "UPLOAD_TOO_LARGE");
        body.put("message", "Maximum upload size exceeded. Increase spring.servlet.multipart.max-file-size/max-request-size.");
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(body);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        Map<String, Object> body = new LinkedHashMap<>();
        if (ex.getRequiredType() != null && ex.getRequiredType().getName().equals("java.util.UUID")) {
            body.put("error", "INVALID_ID");
            body.put("message", "Invalid UUID for parameter '" + ex.getName() + "'.");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
        }

        body.put("error", "INVALID_PARAMETER");
        body.put("message", "Invalid value for parameter '" + ex.getName() + "'.");
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "BAD_REQUEST");
        body.put("message", ex.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }
}
