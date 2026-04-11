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

    public AuthenticatedUser authenticate(String authorizationHeader) {
        String token = extractBearerToken(authorizationHeader);
        return authenticateToken(token);
    }

    public AuthenticatedUser authenticateToken(String token) {
        return resolveAuthenticatedUser(token);
    }

    public AuthenticatedUserResponse getCurrentUserResponse() {
        return toResponse(AuthContext.requireCurrentUser());
    }

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