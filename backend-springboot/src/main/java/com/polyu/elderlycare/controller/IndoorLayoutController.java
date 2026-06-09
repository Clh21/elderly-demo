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

/**
 * Exposes indoor layout editing and simulator control endpoints.
 */
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

    /**
     * Returns the active indoor layout used by positioning views.
     *
     * @return active indoor layout
     */
    @GetMapping("/active")
    public IndoorLayoutResponse getActiveLayout() {
        return indoorLayoutService.getActiveLayout();
    }

    /**
     * Saves the active indoor layout. Admin access is required.
     *
     * @param request layout payload from the editor
     * @return saved and sanitized layout
     */
    @PutMapping("/active")
    public IndoorLayoutResponse saveActiveLayout(@RequestBody IndoorLayoutResponse request) {
        accessScopeService.requireAdmin();
        return indoorLayoutService.saveActiveLayout(request);
    }

    /**
     * Resets the active indoor layout to the demo default. Admin access is required.
     *
     * @return reset layout
     */
    @PostMapping("/active/reset")
    public IndoorLayoutResponse resetActiveLayout() {
        accessScopeService.requireAdmin();
        return indoorLayoutService.resetActiveLayout();
    }

    /**
     * Returns the indoor positioning simulator status.
     *
     * @return simulator status
     */
    @GetMapping("/simulator")
    public IndoorSimulatorStatusResponse getSimulatorStatus() {
        return indoorPositionSimulationService.getStatus();
    }

    /**
     * Enables or disables the indoor positioning simulator. Admin access is required.
     *
     * @param request simulator status update
     * @return updated simulator status
     */
    @PutMapping("/simulator")
    public IndoorSimulatorStatusResponse updateSimulatorStatus(@RequestBody IndoorSimulatorStatusRequest request) {
        accessScopeService.requireAdmin();
        return indoorPositionSimulationService.setEnabled(request.enabled());
    }
}
