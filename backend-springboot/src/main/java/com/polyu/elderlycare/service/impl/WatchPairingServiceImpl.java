package com.polyu.elderlycare.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.polyu.elderlycare.auth.AccessScopeService;
import com.polyu.elderlycare.dto.WatchPairingConfigureRequest;
import com.polyu.elderlycare.dto.WatchPairingConfigureResponse;
import com.polyu.elderlycare.dto.WatchPairingHandshakeRequest;
import com.polyu.elderlycare.dto.WatchPairingHandshakeResponse;
import com.polyu.elderlycare.dto.WatchPairingServerTargetResponse;
import com.polyu.elderlycare.repository.WatchDataRepository;
import com.polyu.elderlycare.service.WatchPairingService;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.net.Inet4Address;
import java.net.NetworkInterface;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WatchPairingServiceImpl implements WatchPairingService {

    private static final int DEFAULT_WATCH_PAIRING_PORT = 8765;
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(4);
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(8);
    private static final Duration HANDSHAKE_TTL = Duration.ofSeconds(30);

    private final AccessScopeService accessScopeService;
    private final WatchDataRepository watchDataRepository;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final ConcurrentMap<String, PendingPairing> pendingPairings = new ConcurrentHashMap<>();

    public WatchPairingServiceImpl(
            AccessScopeService accessScopeService,
            WatchDataRepository watchDataRepository,
            ObjectMapper objectMapper
    ) {
        this.accessScopeService = accessScopeService;
        this.watchDataRepository = watchDataRepository;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(CONNECT_TIMEOUT)
                .build();
    }

    @Override
    public WatchPairingServerTargetResponse getServerTarget(HttpServletRequest request) {
        String host = resolveServerHost(request);
        int port = request == null ? 3100 : request.getLocalPort();
        return new WatchPairingServerTargetResponse(
                host,
                port,
                buildServerEndpoint(host, port)
        );
    }

    @Override
    public WatchPairingConfigureResponse configureWatch(WatchPairingConfigureRequest request) {
        accessScopeService.assertWatchAccess(request.watchId());

        cleanupExpiredPairings();
        int watchPort = request.watchPort() == null ? DEFAULT_WATCH_PAIRING_PORT : request.watchPort();
        int serverPort = request.serverPort() == null ? 3100 : request.serverPort();
        String watchEndpoint = "http://" + request.watchIp().trim() + ":" + watchPort + "/config";
        String serverHost = request.serverHost().trim();
        String watchId = request.watchId().trim();
        String serverEndpoint = buildServerEndpoint(serverHost, serverPort);
        String pairingChallenge = UUID.randomUUID().toString();
        pendingPairings.put(
                pairingChallenge,
                new PendingPairing(
                        pairingChallenge,
                        watchId,
                        serverHost,
                        serverPort,
                        Instant.now().plus(HANDSHAKE_TTL),
                        false
                )
        );

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("watchId", watchId);
        payload.put("serverHost", serverHost);
        payload.put("serverPort", serverPort);
        payload.put("pairingChallenge", pairingChallenge);
        String pairingCode = trimToNull(request.pairingCode());
        if (pairingCode != null) {
            payload.put("pairingCode", pairingCode);
        }

        HttpRequest watchRequest;
        try {
            watchRequest = HttpRequest.newBuilder(URI.create(watchEndpoint))
                    .timeout(REQUEST_TIMEOUT)
                    .header("Content-Type", "application/json; charset=utf-8")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                    .build();
        } catch (IllegalArgumentException | IOException ex) {
            throw new IllegalArgumentException("Invalid watch pairing request: " + ex.getMessage());
        }

        HttpResponse<String> watchResponse;
        try {
            watchResponse = httpClient.send(watchRequest, HttpResponse.BodyHandlers.ofString());
        } catch (IOException ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Could not reach watch at " + watchEndpoint + ": " + ex.getMessage(),
                    ex
            );
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Watch pairing request was interrupted", ex);
        }

        Map<String, Object> responseBody = parseWatchResponse(watchResponse.body());
        PendingPairing pendingPairing = pendingPairings.remove(pairingChallenge);
        if (watchResponse.statusCode() < 200 || watchResponse.statusCode() >= 300) {
            String message = responseBody.get("error") == null
                    ? "Watch rejected pairing request with HTTP " + watchResponse.statusCode()
                    : responseBody.get("error").toString();
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, message);
        }
        if (pendingPairing == null || !pendingPairing.handshakeConfirmed()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Watch did not complete the server handshake. Check the Server IP and port."
            );
        }

        return new WatchPairingConfigureResponse(
                true,
                watchId,
                watchEndpoint,
                serverEndpoint,
                responseBody
        );
    }

    @Override
    public WatchPairingHandshakeResponse confirmHandshake(WatchPairingHandshakeRequest request) {
        cleanupExpiredPairings();
        String challenge = request.pairingChallenge().trim();
        PendingPairing pendingPairing = pendingPairings.get(challenge);
        if (pendingPairing == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Pairing challenge is invalid or expired");
        }

        String watchId = request.watchId().trim();
        String serverHost = request.serverHost().trim();
        int serverPort = request.serverPort();
        if (!Objects.equals(pendingPairing.watchId(), watchId) ||
                !Objects.equals(pendingPairing.serverHost(), serverHost) ||
                pendingPairing.serverPort() != serverPort) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Pairing handshake does not match requested configuration");
        }
        if (watchDataRepository.findResidentByWatchId(watchId).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown watchId: " + watchId);
        }

        pendingPairings.put(challenge, pendingPairing.confirmed());
        return new WatchPairingHandshakeResponse(
                true,
                watchId,
                buildServerEndpoint(serverHost, serverPort),
                "Server handshake confirmed"
        );
    }

    private void cleanupExpiredPairings() {
        Instant now = Instant.now();
        pendingPairings.entrySet().removeIf(entry -> entry.getValue().expiresAt().isBefore(now));
    }

    private String resolveServerHost(HttpServletRequest request) {
        String requestHost = Optional.ofNullable(request)
                .map(HttpServletRequest::getLocalAddr)
                .map(String::trim)
                .orElse("");
        if (isUsableLanHost(requestHost)) {
            return requestHost;
        }

        return findLanHost().orElse(requestHost.isBlank() ? "127.0.0.1" : requestHost);
    }

    private Optional<String> findLanHost() {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface networkInterface = interfaces.nextElement();
                if (!networkInterface.isUp() || networkInterface.isLoopback() || networkInterface.isVirtual()) {
                    continue;
                }
                Enumeration<java.net.InetAddress> addresses = networkInterface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    java.net.InetAddress address = addresses.nextElement();
                    if (address instanceof Inet4Address &&
                            !address.isLoopbackAddress() &&
                            address.isSiteLocalAddress()) {
                        return Optional.of(address.getHostAddress());
                    }
                }
            }
        } catch (Exception ignored) {
            // Fall back to request local address.
        }
        return Optional.empty();
    }

    private boolean isUsableLanHost(String host) {
        return host != null &&
                !host.isBlank() &&
                !"127.0.0.1".equals(host) &&
                !"localhost".equalsIgnoreCase(host) &&
                !"0:0:0:0:0:0:0:1".equals(host) &&
                !"::1".equals(host);
    }

    private String buildServerEndpoint(String serverHost, int serverPort) {
        return "http://" + serverHost + ":" + serverPort + "/api/samsung-watch";
    }

    private Map<String, Object> parseWatchResponse(String body) {
        if (body == null || body.isBlank()) {
            return Map.of();
        }

        try {
            return objectMapper.readValue(body, new TypeReference<>() {
            });
        } catch (IOException ex) {
            return Map.of("raw", body);
        }
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private record PendingPairing(
            String challenge,
            String watchId,
            String serverHost,
            int serverPort,
            Instant expiresAt,
            boolean handshakeConfirmed
    ) {
        PendingPairing confirmed() {
            return new PendingPairing(challenge, watchId, serverHost, serverPort, expiresAt, true);
        }
    }
}
