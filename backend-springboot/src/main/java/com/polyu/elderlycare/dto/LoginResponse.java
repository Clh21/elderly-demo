package com.polyu.elderlycare.dto;

public record LoginResponse(
        String token,
        AuthenticatedUserResponse user
) {
}