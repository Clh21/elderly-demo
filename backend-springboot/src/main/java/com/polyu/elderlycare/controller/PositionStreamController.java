package com.polyu.elderlycare.controller;

import com.polyu.elderlycare.auth.AccessScopeService;
import com.polyu.elderlycare.dto.PositioningStatusResponse;
import com.polyu.elderlycare.service.PositionMqttBridgeService;
import com.polyu.elderlycare.service.PositionStreamService;
import java.io.IOException;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/stream")
public class PositionStreamController {

    private final AccessScopeService accessScopeService;
    private final PositionStreamService positionStreamService;
    private final PositionMqttBridgeService positionMqttBridgeService;

    public PositionStreamController(
            AccessScopeService accessScopeService,
            PositionStreamService positionStreamService,
            PositionMqttBridgeService positionMqttBridgeService
    ) {
        this.accessScopeService = accessScopeService;
        this.positionStreamService = positionStreamService;
        this.positionMqttBridgeService = positionMqttBridgeService;
    }

    @GetMapping(value = "/position-updates", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subscribeToPositionUpdates() {
        var user = accessScopeService.getCurrentUser();
        PositioningStatusResponse status = positionMqttBridgeService.getStatus();
        if (!status.available()) {
            return unavailableEmitter(status);
        }
        return positionStreamService.subscribe(user);
    }

    private SseEmitter unavailableEmitter(PositioningStatusResponse status) {
        SseEmitter emitter = new SseEmitter(0L);

        try {
            emitter.send(
                    SseEmitter.event()
                            .name("position-status")
                            .reconnectTime(60000L)
                            .data(status, MediaType.APPLICATION_JSON)
            );
        } catch (IOException | IllegalStateException ignored) {
            // Ignore failures for clients that disconnected immediately.
        } finally {
            try {
                emitter.complete();
            } catch (Exception ignored) {
                // Ignore cleanup failures.
            }
        }

        return emitter;
    }
}
