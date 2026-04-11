package com.polyu.elderlycare.exception;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<?> handleUnauthorized(HttpServletRequest request, UnauthorizedException ex) {
        return buildErrorResponse(request, HttpStatus.UNAUTHORIZED, ex.getMessage());
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<?> handleForbidden(HttpServletRequest request, ForbiddenException ex) {
        return buildErrorResponse(request, HttpStatus.FORBIDDEN, ex.getMessage());
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<?> handleNotFound(HttpServletRequest request, ResourceNotFoundException ex) {
        return buildErrorResponse(request, HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<?> handleValidation(HttpServletRequest request, MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(error -> error.getField() + " " + error.getDefaultMessage())
                .orElse("Validation failed");
        return buildErrorResponse(request, HttpStatus.BAD_REQUEST, message);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<?> handleBadRequest(HttpServletRequest request, IllegalArgumentException ex) {
        return buildErrorResponse(request, HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> handleGeneric(HttpServletRequest request, Exception ex) {
        return buildErrorResponse(request, HttpStatus.INTERNAL_SERVER_ERROR, ex.getMessage());
    }

    private ResponseEntity<?> buildErrorResponse(HttpServletRequest request, HttpStatus status, String message) {
        if (isSseRequest(request)) {
            return ResponseEntity.status(status)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body(message);
        }

        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("error", message));
    }

    private boolean isSseRequest(HttpServletRequest request) {
        if (request == null) {
            return false;
        }

        String requestUri = request.getRequestURI();
        if (requestUri != null && requestUri.startsWith("/api/stream/")) {
            return true;
        }

        String accept = request.getHeader("Accept");
        return accept != null && accept.contains(MediaType.TEXT_EVENT_STREAM_VALUE);
    }
}