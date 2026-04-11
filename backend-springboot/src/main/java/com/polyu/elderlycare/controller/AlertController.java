package com.polyu.elderlycare.controller;

import com.polyu.elderlycare.dto.AlertResponse;
import com.polyu.elderlycare.dto.CreateAlertRequest;
import com.polyu.elderlycare.service.AlertService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/alerts")
public class AlertController {

    private final AlertService alertService;

    public AlertController(AlertService alertService) {
        this.alertService = alertService;
    }

    @GetMapping
    public List<AlertResponse> getAlerts() {
        return alertService.getAlerts();
    }

    @GetMapping("/latest")
    public List<AlertResponse> getLatestAlerts(@RequestParam(required = false) Integer after) {
        return alertService.getLatestActiveAlerts(after);
    }

    @PostMapping("/create")
    public Map<String, Boolean> createAlert(@Valid @RequestBody CreateAlertRequest request) {
        alertService.createAlert(request);
        return Map.of("success", true);
    }

    @PostMapping("/{id}/resolve")
    public Map<String, Boolean> resolveAlert(@PathVariable Integer id) {
        alertService.resolveAlert(id);
        return Map.of("success", true);
    }
}