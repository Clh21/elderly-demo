package com.polyu.elderlycare.controller;

import com.polyu.elderlycare.auth.AuthService;
import com.polyu.elderlycare.dto.AuthenticatedUserResponse;
import com.polyu.elderlycare.dto.LoginRequest;
import com.polyu.elderlycare.dto.LoginResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @GetMapping("/me")
    public AuthenticatedUserResponse getCurrentUser() {
        return authService.getCurrentUserResponse();
    }

    @PostMapping("/logout")
    public Map<String, Boolean> logout(HttpServletRequest request) {
        authService.logout(request.getHeader("Authorization"));
        return Map.of("success", true);
    }
}