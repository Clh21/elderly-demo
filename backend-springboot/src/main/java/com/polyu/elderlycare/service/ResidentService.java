package com.polyu.elderlycare.service;

import com.polyu.elderlycare.dto.HealthSummaryResponse;
import com.polyu.elderlycare.dto.ResidentResponse;
import java.util.List;

/**
 * Provides resident directory and health history operations for the current user scope.
 */
public interface ResidentService {

    /**
     * Lists active residents visible to the current user.
     *
     * @return resident summaries; admins receive all active residents, viewers receive their assigned resident
     */
    List<ResidentResponse> getActiveResidents();

    /**
     * Reads daily health history for a resident.
     *
     * @param residentId resident id to query
     * @param days number of days to include, using at least one day
     * @return daily health summaries ordered by date
     */
    List<HealthSummaryResponse> getHealthHistory(Integer residentId, int days);
}
