package com.polyu.elderlycare.service;

import java.util.Map;

public interface WatchService {

    Map<String, Object> getWatchSummary(String watchId);

    Map<String, Object> getEcgHistory(String watchId, int page, int pageSize);

    Map<String, Object> getEcgHistoryDetail(String watchId, Long readingId);

    Map<String, Object> deleteEcgHistoryRecord(String watchId, Long readingId);

    Map<String, Object> reanalyzeEcgHistory(String watchId);

    Map<String, Object> reanalyzeAllEcgHistory();

    Map<String, Object> backfillEdaValidSampleCounts(String watchId);

    Map<String, Object> backfillAllEdaValidSampleCounts();

    Map<String, Object> getMetricDetail(String watchId, String metric, String date);

    Map<String, Object> buildEdaBaseline(String watchId);

    Map<String, Object> ingestSamsungWatch(String watchIdParam, String watchIdHeader, Map<String, Object> payload);

    Map<String, Object> ingestLegacyWatchReading(Map<String, Object> payload);
}