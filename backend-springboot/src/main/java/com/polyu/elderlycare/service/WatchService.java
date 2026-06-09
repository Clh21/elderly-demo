package com.polyu.elderlycare.service;

import java.util.Map;

/**
 * Provides watch data queries, maintenance operations, and ingestion endpoints.
 */
public interface WatchService {

    /**
     * Builds the latest dashboard summary for a watch.
     *
     * @param watchId watch id to query
     * @return summary payload consumed by the frontend dashboard
     */
    Map<String, Object> getWatchSummary(String watchId);

    /**
     * Lists stored ECG readings for a watch.
     *
     * @param watchId watch id to query
     * @param page one-based page number
     * @param pageSize requested page size
     * @return paginated ECG history payload
     */
    Map<String, Object> getEcgHistory(String watchId, int page, int pageSize);

    /**
     * Reads one ECG record with waveform detail.
     *
     * @param watchId watch id that owns the reading
     * @param readingId ECG reading id
     * @return ECG detail payload
     */
    Map<String, Object> getEcgHistoryDetail(String watchId, Long readingId);

    /**
     * Deletes one ECG history record.
     *
     * @param watchId watch id that owns the reading
     * @param readingId ECG reading id to delete
     * @return operation result payload
     */
    Map<String, Object> deleteEcgHistoryRecord(String watchId, Long readingId);

    /**
     * Re-runs ECG analysis for stored readings on one watch.
     *
     * @param watchId watch id to reanalyze
     * @return batch processing result
     */
    Map<String, Object> reanalyzeEcgHistory(String watchId);

    /**
     * Re-runs ECG analysis for all stored ECG readings. Admin access is required.
     *
     * @return batch processing result
     */
    Map<String, Object> reanalyzeAllEcgHistory();

    /**
     * Backfills valid EDA sample counts for one watch.
     *
     * @param watchId watch id to process
     * @return batch processing result
     */
    Map<String, Object> backfillEdaValidSampleCounts(String watchId);

    /**
     * Backfills valid EDA sample counts for all watches. Admin access is required.
     *
     * @return batch processing result
     */
    Map<String, Object> backfillAllEdaValidSampleCounts();

    /**
     * Builds a single-day metric detail payload for charts.
     *
     * @param watchId watch id to query
     * @param metric frontend metric key
     * @param date optional date in yyyy-MM-dd format
     * @return metric detail payload
     */
    Map<String, Object> getMetricDetail(String watchId, String metric, String date);

    /**
     * Builds or refreshes the EDA baseline profile for a watch.
     *
     * @param watchId watch id to process
     * @return baseline build result and unmet requirement details
     */
    Map<String, Object> buildEdaBaseline(String watchId);

    /**
     * Ingests data posted by the Samsung watch application.
     *
     * @param watchIdParam optional watch id query parameter
     * @param watchIdHeader optional watch id header
     * @param payload raw watch payload
     * @return ingestion result payload
     */
    Map<String, Object> ingestSamsungWatch(String watchIdParam, String watchIdHeader, Map<String, Object> payload);

    /**
     * Ingests the legacy watch-reading payload used by older demos.
     *
     * @param payload raw watch reading payload
     * @return ingestion result payload
     */
    Map<String, Object> ingestLegacyWatchReading(Map<String, Object> payload);
}
