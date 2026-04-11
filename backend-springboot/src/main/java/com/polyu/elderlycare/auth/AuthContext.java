package com.polyu.elderlycare.auth;

import com.polyu.elderlycare.exception.UnauthorizedException;

public final class AuthContext {

    private static final ThreadLocal<AuthenticatedUser> CURRENT_USER = new ThreadLocal<>();

    private AuthContext() {
    }

    public static void setCurrentUser(AuthenticatedUser user) {
        CURRENT_USER.set(user);
    }

    public static AuthenticatedUser getCurrentUser() {
        return CURRENT_USER.get();
    }

    public static AuthenticatedUser requireCurrentUser() {
        AuthenticatedUser user = CURRENT_USER.get();
        if (user == null) {
            throw new UnauthorizedException("Authentication required");
        }
        return user;
    }

    public static void clear() {
        CURRENT_USER.remove();
    }
}