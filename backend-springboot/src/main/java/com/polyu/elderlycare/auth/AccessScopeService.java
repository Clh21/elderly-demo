package com.polyu.elderlycare.auth;

import com.polyu.elderlycare.exception.ForbiddenException;
import java.util.Objects;
import org.springframework.stereotype.Service;

/**
 * Centralizes role and resident/watch scope checks for controller and service methods.
 */
@Service
public class AccessScopeService {

    /**
     * Reads the authenticated user from the current request context.
     *
     * @return current authenticated user
     */
    public AuthenticatedUser getCurrentUser() {
        return AuthContext.requireCurrentUser();
    }

    /**
     * Checks whether the current user has administrator privileges.
     *
     * @return {@code true} when the current user is an admin
     */
    public boolean isAdmin() {
        return getCurrentUser().isAdmin();
    }

    /**
     * Requires the current user to be an administrator.
     */
    public void requireAdmin() {
        if (!isAdmin()) {
            throw new ForbiddenException("Administrator access is required");
        }
    }

    /**
     * Requires the current user to have a resident scope.
     *
     * @return resident id assigned to the current user
     */
    public Integer requireResidentId() {
        Integer residentId = getCurrentUser().residentId();
        if (residentId == null) {
            throw new ForbiddenException("Resident scope is not configured for this account");
        }
        return residentId;
    }

    /**
     * Requires the current user to have a watch scope.
     *
     * @return watch id assigned to the current user
     */
    public String requireWatchId() {
        String watchId = getCurrentUser().watchId();
        if (watchId == null || watchId.isBlank()) {
            throw new ForbiddenException("Watch scope is not configured for this account");
        }
        return watchId;
    }

    /**
     * Verifies that the current user may access the resident.
     *
     * @param residentId resident id to check
     */
    public void assertResidentAccess(Integer residentId) {
        if (!isAdmin() && !Objects.equals(requireResidentId(), residentId)) {
            throw new ForbiddenException("You do not have permission to access this resident");
        }
    }

    /**
     * Verifies that the current user may access the watch.
     *
     * @param watchId watch id to check
     */
    public void assertWatchAccess(String watchId) {
        if (!isAdmin() && !Objects.equals(requireWatchId(), watchId)) {
            throw new ForbiddenException("You do not have permission to access this watch");
        }
    }
}
