package com.polyu.elderlycare.entity;

public enum ResidentStatus {
    ACTIVE("active"),
    INACTIVE("inactive"),
    DEMO("demo");

    private final String value;

    ResidentStatus(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }

    public static ResidentStatus fromValue(String value) {
        for (ResidentStatus status : values()) {
            if (status.value.equalsIgnoreCase(value)) {
                return status;
            }
        }
        throw new IllegalArgumentException("Unknown resident status: " + value);
    }
}