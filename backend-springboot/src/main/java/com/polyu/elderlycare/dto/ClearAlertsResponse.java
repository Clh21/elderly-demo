package com.polyu.elderlycare.dto;

public record ClearAlertsResponse(
        boolean success,
        int clearedCount
) {

    public static ClearAlertsResponse ok(int clearedCount) {
        return new ClearAlertsResponse(true, clearedCount);
    }
}
