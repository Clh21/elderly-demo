package com.polyu.elderlycare.service;

import com.polyu.elderlycare.dto.AlertResponse;
import com.polyu.elderlycare.dto.CreateAlertRequest;
import java.util.List;

/**
 * Provides alert query and lifecycle operations for the current user's access scope.
 */
public interface AlertService {

    /**
     * Lists recent alerts visible to the current user.
     *
     * @return alert records ordered from newest to oldest
     */
    List<AlertResponse> getAlerts();

    /**
     * Lists newly-created active alerts after the provided alert id.
     *
     * @param afterId last alert id already seen by the client; {@code null} starts from zero
     * @return active alert records ordered from oldest to newest
     */
    List<AlertResponse> getLatestActiveAlerts(Integer afterId);

    /**
     * Creates a new alert for a resident. Only admin users may create alerts.
     *
     * @param request alert creation payload
     */
    void createAlert(CreateAlertRequest request);

    /**
     * Marks a single alert as resolved. Only admin users may resolve individual alerts.
     *
     * @param id alert id to resolve
     */
    void resolveAlert(Integer id);

    /**
     * Resolves all active alerts in the current user's access scope.
     *
     * @return number of alerts changed from active to resolved
     */
    int clearActiveAlertsForCurrentScope();
}
