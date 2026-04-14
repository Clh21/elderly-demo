package com.polyu.elderlycare.auth;

public record AuthenticatedUser(
        String username,
        String displayName,
        AppRole role,
        Integer residentId,
        String residentName,
        String watchId
) {

    public boolean isAdmin() {
        return role == AppRole.ADMIN;
    }
}