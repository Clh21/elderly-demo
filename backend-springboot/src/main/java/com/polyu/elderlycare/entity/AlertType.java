package com.polyu.elderlycare.entity;

public enum AlertType {
    HEART_RATE("heart_rate"),
    TEMPERATURE("temperature"),
    EDA("eda"),
    FALL_DETECTION("fall_detection"),
    WEAR_STATUS("wear_status"),
    DATA_GAP("data_gap"),
    ABNORMAL_STILLNESS("abnormal_stillness"); // 新增 AI 长时静止判定类型

    private final String value;

    AlertType(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }

    public static AlertType fromValue(String value) {
        for (AlertType type : values()) {
            if (type.value.equalsIgnoreCase(value)) {
                return type;
            }
        }
        throw new IllegalArgumentException("Unknown alert type: " + value);
    }
}