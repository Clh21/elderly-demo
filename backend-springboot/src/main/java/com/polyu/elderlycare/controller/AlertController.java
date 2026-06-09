package com.polyu.elderlycare.controller;

import com.polyu.elderlycare.dto.AlertResponse;
import com.polyu.elderlycare.dto.ClearAlertsResponse;
import com.polyu.elderlycare.dto.CreateAlertRequest;
import com.polyu.elderlycare.dto.SuccessResponse;
import com.polyu.elderlycare.service.AlertService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Exposes alert query and resolution endpoints for the dashboard.
 */
@RestController
@RequestMapping("/api/alerts")
public class AlertController {

    private final AlertService alertService;

    public AlertController(AlertService alertService) {
        this.alertService = alertService;
    }

    /**
     * Lists alerts visible to the current user.
     *
     * @return recent alert records
     */
    @GetMapping
    public List<AlertResponse> getAlerts() {
        return alertService.getAlerts();
    }

    /**
     * Polls active alerts created after a known alert id.
     *
     * @param after last alert id already seen by the client
     * @return newly-created active alerts
     */
    @GetMapping("/latest")
    public List<AlertResponse> getLatestAlerts(@RequestParam(required = false) Integer after) {
        return alertService.getLatestActiveAlerts(after);
    }

    /**
     * Creates a new alert for a resident.
     *
     * @param request alert creation payload
     * @return success flag
     */
    @PostMapping("/create")
    public SuccessResponse createAlert(@Valid @RequestBody CreateAlertRequest request) {
        alertService.createAlert(request);
        return SuccessResponse.ok();
    }

    /**
     * Resolves one alert by id.
     *
     * @param id alert id
     * @return success flag
     */
    @PostMapping("/{id}/resolve")
    public SuccessResponse resolveAlert(@PathVariable Integer id) {
        alertService.resolveAlert(id);
        return SuccessResponse.ok();
    }

    /**
     * Resolves all active alerts in the current access scope.
     *
     * @return success flag and number of cleared alerts
     */
    @PostMapping("/clear")
    public ClearAlertsResponse clearAlerts() {
        int clearedCount = alertService.clearActiveAlertsForCurrentScope();
        return ClearAlertsResponse.ok(clearedCount);
    }
}
