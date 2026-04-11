package com.polyu.elderlycare.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingRequestWrapper;
import org.springframework.web.util.ContentCachingResponseWrapper;

@Component
public class HttpLoggingFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(HttpLoggingFilter.class);
    private static final String REQUEST_ID_HEADER = "X-Request-Id";

    @Value("${app.http-logging.enabled:true}")
    private boolean enabled;

    @Value("${app.http-logging.max-body-length:4000}")
    private int maxBodyLength;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String requestUri = request.getRequestURI();
        return !enabled || !requestUri.startsWith("/api/") || requestUri.startsWith("/api/stream/");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        ContentCachingRequestWrapper wrappedRequest = request instanceof ContentCachingRequestWrapper cachingRequest
                ? cachingRequest
                : new ContentCachingRequestWrapper(request);
        ContentCachingResponseWrapper wrappedResponse = response instanceof ContentCachingResponseWrapper cachingResponse
                ? cachingResponse
                : new ContentCachingResponseWrapper(response);

        String requestId = resolveRequestId(wrappedRequest);
        wrappedResponse.setHeader(REQUEST_ID_HEADER, requestId);

        long startTime = System.currentTimeMillis();
        try {
            filterChain.doFilter(wrappedRequest, wrappedResponse);
        } finally {
            long durationMs = System.currentTimeMillis() - startTime;
            logExchange(requestId, wrappedRequest, wrappedResponse, durationMs);
            wrappedResponse.copyBodyToResponse();
        }
    }

    private void logExchange(
            String requestId,
            ContentCachingRequestWrapper request,
            ContentCachingResponseWrapper response,
            long durationMs
    ) {
        String requestLine = request.getMethod() + " " + buildPath(request);
        log.info("[{}] --> {}", requestId, requestLine);
        log.info("[{}] Request headers: {}", requestId, sanitizeHeaders(request));

        String requestBody = getBodyAsString(request.getContentAsByteArray(), request.getCharacterEncoding(), request.getContentType());
        if (StringUtils.hasText(requestBody)) {
            log.info("[{}] Request body: {}", requestId, requestBody);
        }

        log.info("[{}] <-- {} {} ({} ms)", requestId, response.getStatus(), requestLine, durationMs);
        String responseBody = getBodyAsString(response.getContentAsByteArray(), response.getCharacterEncoding(), response.getContentType());
        if (StringUtils.hasText(responseBody)) {
            log.info("[{}] Response body: {}", requestId, responseBody);
        }
    }

    private String resolveRequestId(HttpServletRequest request) {
        String requestId = request.getHeader(REQUEST_ID_HEADER);
        return StringUtils.hasText(requestId) ? requestId : UUID.randomUUID().toString();
    }

    private String buildPath(HttpServletRequest request) {
        String query = request.getQueryString();
        return query == null ? request.getRequestURI() : request.getRequestURI() + "?" + sanitizeQueryString(query);
    }

    private Map<String, String> sanitizeHeaders(HttpServletRequest request) {
        Map<String, String> headers = new LinkedHashMap<>();
        Enumeration<String> headerNames = request.getHeaderNames();
        if (headerNames == null) {
            return Collections.emptyMap();
        }

        while (headerNames.hasMoreElements()) {
            String headerName = headerNames.nextElement();
            String value = request.getHeader(headerName);
            if ("authorization".equalsIgnoreCase(headerName)) {
                value = "Bearer [redacted]";
            }
            headers.put(headerName, value);
        }

        return headers;
    }

    private String getBodyAsString(byte[] content, String encoding, String contentType) {
        if (content == null || content.length == 0 || !isLoggableContentType(contentType)) {
            return null;
        }

        String charset = StringUtils.hasText(encoding) ? encoding : StandardCharsets.UTF_8.name();
        String body = new String(content, StandardCharsets.UTF_8);
        if (!StandardCharsets.UTF_8.name().equalsIgnoreCase(charset)) {
            body = new String(content, java.nio.charset.Charset.forName(charset));
        }

        if (body.length() <= maxBodyLength) {
            return body;
        }

        return body.substring(0, maxBodyLength) + "... [truncated]";
    }

    private boolean isLoggableContentType(String contentType) {
        if (!StringUtils.hasText(contentType)) {
            return true;
        }

        String normalized = contentType.toLowerCase();
        return normalized.contains("application/json")
                || normalized.contains("text/")
                || normalized.contains("application/x-www-form-urlencoded");
    }

    private String sanitizeQueryString(String query) {
        return query.replaceAll("(?i)(access_token=)[^&]+", "$1[redacted]");
    }
}