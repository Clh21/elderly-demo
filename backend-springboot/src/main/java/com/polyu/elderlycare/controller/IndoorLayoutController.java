package com.polyu.elderlycare.controller;

import com.polyu.elderlycare.auth.AccessScopeService;
import com.polyu.elderlycare.dto.IndoorLayoutResponse;
import com.polyu.elderlycare.dto.IndoorSimulatorStatusRequest;
import com.polyu.elderlycare.dto.IndoorSimulatorStatusResponse;
import com.polyu.elderlycare.service.IndoorLayoutService;
import com.polyu.elderlycare.service.IndoorPositionSimulationService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/indoor-layout")
public class IndoorLayoutController {

    private final AccessScopeService accessScopeService;
    private final IndoorLayoutService indoorLayoutService;
    private final IndoorPositionSimulationService indoorPositionSimulationService;

    public IndoorLayoutController(
            AccessScopeService accessScopeService,
            IndoorLayoutService indoorLayoutService,
            IndoorPositionSimulationService indoorPositionSimulationService
    ) {
        this.accessScopeService = accessScopeService;
        this.indoorLayoutService = indoorLayoutService;
        this.indoorPositionSimulationService = indoorPositionSimulationService;
    }

    @GetMapping("/active")
    public IndoorLayoutResponse getActiveLayout() {
        return indoorLayoutService.getActiveLayout();
    }

    @PutMapping("/active")
    public IndoorLayoutResponse saveActiveLayout(@RequestBody IndoorLayoutResponse request) {
        accessScopeService.requireAdmin();
        return indoorLayoutService.saveActiveLayout(request);
    }

    @PostMapping("/active/reset")
    public IndoorLayoutResponse resetActiveLayout() {
        accessScopeService.requireAdmin();
        return indoorLayoutService.resetActiveLayout();
    }

    @GetMapping("/simulator")
    public IndoorSimulatorStatusResponse getSimulatorStatus() {
        return indoorPositionSimulationService.getStatus();
    }

    @PutMapping("/simulator")
    public IndoorSimulatorStatusResponse updateSimulatorStatus(@RequestBody IndoorSimulatorStatusRequest request) {
        accessScopeService.requireAdmin();
        return indoorPositionSimulationService.setEnabled(request.enabled());
    }
}
