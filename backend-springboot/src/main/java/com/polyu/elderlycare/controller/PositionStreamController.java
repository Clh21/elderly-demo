package com.polyu.elderlycare.controller;

import com.polyu.elderlycare.auth.AccessScopeService;
import com.polyu.elderlycare.service.PositionStreamService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Exposes server-sent events for indoor position updates.
 */
@RestController
@RequestMapping("/api/stream")
public class PositionStreamController {

    private final AccessScopeService accessScopeService;
    private final PositionStreamService positionStreamService;

    public PositionStreamController(
            AccessScopeService accessScopeService,
            PositionStreamService positionStreamService
    ) {
        this.accessScopeService = accessScopeService;
        this.positionStreamService = positionStreamService;
    }

    /**
     * Subscribes the current user to indoor position update events.
     *
     * @return SSE emitter for position updates
     */
    @GetMapping(value = "/position-updates", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subscribeToPositionUpdates() {
        return positionStreamService.subscribe(accessScopeService.getCurrentUser());
    }
}
