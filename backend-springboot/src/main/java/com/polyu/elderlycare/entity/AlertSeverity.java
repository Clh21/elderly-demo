package com.polyu.elderlycare.entity;

public enum AlertSeverity {
    WARNING("warning"),
    CRITICAL("critical");

    private final String value;

    AlertSeverity(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }

    public static AlertSeverity fromValue(String value) {
        for (AlertSeverity severity : values()) {
            if (severity.value.equalsIgnoreCase(value)) {
                return severity;
            }
        }
        throw new IllegalArgumentException("Unknown alert severity: " + value);
    }
}