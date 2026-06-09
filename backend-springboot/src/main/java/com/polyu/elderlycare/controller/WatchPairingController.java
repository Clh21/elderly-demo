package com.polyu.elderlycare.controller;

import com.polyu.elderlycare.dto.WatchPairingConfigureRequest;
import com.polyu.elderlycare.dto.WatchPairingConfigureResponse;
import com.polyu.elderlycare.dto.WatchPairingHandshakeRequest;
import com.polyu.elderlycare.dto.WatchPairingHandshakeResponse;
import com.polyu.elderlycare.dto.WatchPairingServerTargetResponse;
import com.polyu.elderlycare.service.WatchPairingService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Exposes endpoints used to pair a watch device with the backend.
 */
@RestController
@RequestMapping("/api/watch-pairing")
public class WatchPairingController {

    private final WatchPairingService watchPairingService;

    public WatchPairingController(WatchPairingService watchPairingService) {
        this.watchPairingService = watchPairingService;
    }

    /**
     * Returns the backend target address that the watch app should use.
     *
     * @param request current HTTP request used to infer the server host
     * @return server target payload
     */
    @GetMapping("/server-target")
    public WatchPairingServerTargetResponse getServerTarget(HttpServletRequest request) {
        return watchPairingService.getServerTarget(request);
    }

    /**
     * Creates a pairing configuration for a watch.
     *
     * @param request pairing configuration payload
     * @return pairing configuration result
     */
    @PostMapping("/configure")
    public WatchPairingConfigureResponse configureWatch(
            @Valid @RequestBody WatchPairingConfigureRequest request
    ) {
        return watchPairingService.configureWatch(request);
    }

    /**
     * Confirms that a watch can reach this backend.
     *
     * @param request watch handshake payload
     * @return handshake result
     */
    @PostMapping("/handshake")
    public WatchPairingHandshakeResponse confirmHandshake(
            @Valid @RequestBody WatchPairingHandshakeRequest request
    ) {
        return watchPairingService.confirmHandshake(request);
    }
}
