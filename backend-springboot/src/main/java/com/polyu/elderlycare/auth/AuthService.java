package com.polyu.elderlycare.auth;

import com.polyu.elderlycare.dto.AuthenticatedUserResponse;
import com.polyu.elderlycare.dto.LoginRequest;
import com.polyu.elderlycare.dto.LoginResponse;
import com.polyu.elderlycare.exception.UnauthorizedException;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import org.springframework.stereotype.Service;

/**
 * Manages demo account authentication and in-memory session tokens.
 */
@Service
public class AuthService {

    private final AuthProperties authProperties;
    private final Map<String, AuthProperties.Account> accountsByUsername;
    private final Map<String, SessionRecord> sessions = new ConcurrentHashMap<>();

    public AuthService(AuthProperties authProperties) {
        this.authProperties = authProperties;
        this.accountsByUsername = authProperties.getAccounts().stream()
                .collect(java.util.stream.Collectors.toMap(AuthProperties.Account::getUsername, Function.identity()));
    }

    /**
     * Authenticates credentials and creates a new session token.
     *
     * @param request login credentials
     * @return login response with token and user profile
     */
    public LoginResponse login(LoginRequest request) {
        String username = trimToNull(request.username());
        String password = trimToNull(request.password());
        AuthProperties.Account account = username == null ? null : accountsByUsername.get(username);

        if (account == null || password == null || !password.equals(account.getPassword())) {
            throw new UnauthorizedException("Invalid username or password");
        }

        AuthenticatedUser user = toUser(account);
        String token = UUID.randomUUID().toString();
        Instant expiresAt = Instant.now().plus(authProperties.getTokenTtl());
        sessions.put(token, new SessionRecord(user, expiresAt));
        return new LoginResponse(token, toResponse(user));
    }

    /**
     * Authenticates a bearer token from the HTTP Authorization header.
     *
     * @param authorizationHeader Authorization header value
     * @return authenticated user, or {@code null} when the token is missing or invalid
     */
    public AuthenticatedUser authenticate(String authorizationHeader) {
        String token = extractBearerToken(authorizationHeader);
        return authenticateToken(token);
    }

    /**
     * Authenticates a raw token value.
     *
     * @param token session token
     * @return authenticated user, or {@code null} when the token is missing, expired, or unknown
     */
    public AuthenticatedUser authenticateToken(String token) {
        return resolveAuthenticatedUser(token);
    }

    /**
     * Converts the current thread-bound user into a response DTO.
     *
     * @return current user profile
     */
    public AuthenticatedUserResponse getCurrentUserResponse() {
        return toResponse(AuthContext.requireCurrentUser());
    }

    /**
     * Removes the current session token from the in-memory session store.
     *
     * @param authorizationHeader Authorization header containing the bearer token
     */
    public void logout(String authorizationHeader) {
        String token = extractBearerToken(authorizationHeader);
        if (token != null) {
            sessions.remove(token);
        }
    }

    private AuthenticatedUser resolveAuthenticatedUser(String token) {
        if (token == null) {
            return null;
        }

        SessionRecord session = sessions.get(token);
        if (session == null) {
            return null;
        }

        if (session.expiresAt().isBefore(Instant.now())) {
            sessions.remove(token);
            return null;
        }

        return session.user();
    }

    private AuthenticatedUser toUser(AuthProperties.Account account) {
        return new AuthenticatedUser(
                account.getUsername(),
                firstNonBlank(account.getDisplayName(), account.getResidentName(), account.getUsername()),
                account.getRole(),
                account.getResidentId(),
                account.getResidentName(),
                account.getWatchId()
        );
    }

    private AuthenticatedUserResponse toResponse(AuthenticatedUser user) {
        return new AuthenticatedUserResponse(
                user.username(),
                user.displayName(),
                user.role().name(),
                user.residentId(),
                user.residentName(),
                user.watchId()
        );
    }

    private String extractBearerToken(String authorizationHeader) {
        if (authorizationHeader == null || authorizationHeader.isBlank()) {
            return null;
        }

        if (!authorizationHeader.startsWith("Bearer ")) {
            return null;
        }

        String token = authorizationHeader.substring("Bearer ".length()).trim();
        return token.isEmpty() ? null : token;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            String candidate = trimToNull(value);
            if (candidate != null) {
                return candidate;
            }
        }
        return null;
    }

    private record SessionRecord(AuthenticatedUser user, Instant expiresAt) {
    }
}
