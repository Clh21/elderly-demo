package com.polyu.elderlycare.dto;

public record AuthenticatedUserResponse(
        String username,
        String displayName,
        String role,
        Integer residentId,
        String residentName,
        String watchId
) {
}