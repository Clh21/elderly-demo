package com.polyu.elderlycare.service;

import com.polyu.elderlycare.dto.StatsResponse;

/**
 * Provides administrator dashboard statistics.
 */
public interface StatsService {

    /**
     * Calculates high-level system statistics for the admin dashboard.
     *
     * @return current resident, alert, device, and data point counts
     */
    StatsResponse getStats();
}
