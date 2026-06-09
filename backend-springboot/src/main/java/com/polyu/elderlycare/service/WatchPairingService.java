package com.polyu.elderlycare.service;

import com.polyu.elderlycare.dto.WatchPairingConfigureRequest;
import com.polyu.elderlycare.dto.WatchPairingConfigureResponse;
import com.polyu.elderlycare.dto.WatchPairingHandshakeRequest;
import com.polyu.elderlycare.dto.WatchPairingHandshakeResponse;
import com.polyu.elderlycare.dto.WatchPairingServerTargetResponse;
import jakarta.servlet.http.HttpServletRequest;

/**
 * Handles pairing configuration and handshake flows for watch devices.
 */
public interface WatchPairingService {

    /**
     * Resolves the backend endpoint that a watch should use during pairing.
     *
     * @param request current HTTP request used to infer host information
     * @return server target information for the watch app
     */
    WatchPairingServerTargetResponse getServerTarget(HttpServletRequest request);

    /**
     * Stores pairing configuration generated from the web dashboard.
     *
     * @param request pairing configuration payload
     * @return configuration result including generated target data
     */
    WatchPairingConfigureResponse configureWatch(WatchPairingConfigureRequest request);

    /**
     * Confirms that a watch can reach this backend with the provided handshake payload.
     *
     * @param request watch handshake payload
     * @return handshake status and resolved watch identity
     */
    WatchPairingHandshakeResponse confirmHandshake(WatchPairingHandshakeRequest request);
}
