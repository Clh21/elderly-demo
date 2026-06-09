package com.polyu.elderlycare.controller;

import com.polyu.elderlycare.service.WatchService;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Exposes watch ingestion endpoints used by watch apps and legacy simulators.
 */
@RestController
@RequestMapping("/api")
public class WatchIngestionController {

    private final WatchService watchService;

    public WatchIngestionController(WatchService watchService) {
        this.watchService = watchService;
    }

    /**
     * Ingests sensor data from the Samsung watch application.
     *
     * @param watchId optional watch id query parameter
     * @param watchIdHeader optional watch id header
     * @param payload raw watch payload
     * @return ingestion result
     */
    @PostMapping("/samsung-watch")
    public Map<String, Object> ingestSamsungWatch(
            @RequestParam(required = false) String watchId,
            @RequestHeader(name = "x-watch-id", required = false) String watchIdHeader,
            @RequestBody Map<String, Object> payload
    ) {
        return watchService.ingestSamsungWatch(watchId, watchIdHeader, payload);
    }

    /**
     * Ingests a legacy watch-reading payload.
     *
     * @param payload raw reading payload
     * @return ingestion result
     */
    @PostMapping("/watch-reading")
    public Map<String, Object> ingestWatchReading(@RequestBody Map<String, Object> payload) {
        return watchService.ingestLegacyWatchReading(payload);
    }
}
