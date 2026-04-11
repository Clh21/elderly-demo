package com.polyu.elderlycare.auth;

import com.polyu.elderlycare.exception.ForbiddenException;
import java.util.Objects;
import org.springframework.stereotype.Service;

@Service
public class AccessScopeService {

    public AuthenticatedUser getCurrentUser() {
        return AuthContext.requireCurrentUser();
    }

    public boolean isAdmin() {
        return getCurrentUser().isAdmin();
    }

    public void requireAdmin() {
        if (!isAdmin()) {
            throw new ForbiddenException("Administrator access is required");
        }
    }

    public Integer requireResidentId() {
        Integer residentId = getCurrentUser().residentId();
        if (residentId == null) {
            throw new ForbiddenException("Resident scope is not configured for this account");
        }
        return residentId;
    }

    public String requireWatchId() {
        String watchId = getCurrentUser().watchId();
        if (watchId == null || watchId.isBlank()) {
            throw new ForbiddenException("Watch scope is not configured for this account");
        }
        return watchId;
    }

    public void assertResidentAccess(Integer residentId) {
        if (!isAdmin() && !Objects.equals(requireResidentId(), residentId)) {
            throw new ForbiddenException("You do not have permission to access this resident");
        }
    }

    public void assertWatchAccess(String watchId) {
        if (!isAdmin() && !Objects.equals(requireWatchId(), watchId)) {
            throw new ForbiddenException("You do not have permission to access this watch");
        }
    }
}