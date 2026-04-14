package com.polyu.elderlycare.dto;

import java.time.LocalDateTime;

public record AlertResponse(
        Integer id,
        Integer residentId,
        String residentName,
        String type,
        String severity,
        String message,
        String status,
        LocalDateTime timestamp
) {
}