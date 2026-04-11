package com.polyu.elderlycare.controller;

import com.polyu.elderlycare.auth.AccessScopeService;
import com.polyu.elderlycare.service.WatchUpdateStreamService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/stream")
public class WatchUpdateStreamController {

    private final AccessScopeService accessScopeService;
    private final WatchUpdateStreamService watchUpdateStreamService;

    public WatchUpdateStreamController(
            AccessScopeService accessScopeService,
            WatchUpdateStreamService watchUpdateStreamService
    ) {
        this.accessScopeService = accessScopeService;
        this.watchUpdateStreamService = watchUpdateStreamService;
    }

    @GetMapping(value = "/watch-updates", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subscribeToWatchUpdates() {
        return watchUpdateStreamService.subscribe(accessScopeService.getCurrentUser());
    }
}