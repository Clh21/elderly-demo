package com.polyu.elderlycare.controller;

import com.polyu.elderlycare.auth.AuthService;
import com.polyu.elderlycare.dto.AuthenticatedUserResponse;
import com.polyu.elderlycare.dto.LoginRequest;
import com.polyu.elderlycare.dto.LoginResponse;
import com.polyu.elderlycare.dto.SuccessResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Exposes login, session restore, and logout endpoints for dashboard users.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /**
     * Authenticates a user with username and password.
     *
     * @param request login credentials
     * @return session token and user profile
     */
    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    /**
     * Returns the authenticated user represented by the current token.
     *
     * @return current user profile
     */
    @GetMapping("/me")
    public AuthenticatedUserResponse getCurrentUser() {
        return authService.getCurrentUserResponse();
    }

    /**
     * Logs out the current session token.
     *
     * @param request HTTP request containing the Authorization header
     * @return success flag
     */
    @PostMapping("/logout")
    public SuccessResponse logout(HttpServletRequest request) {
        authService.logout(request.getHeader("Authorization"));
        return SuccessResponse.ok();
    }
}
