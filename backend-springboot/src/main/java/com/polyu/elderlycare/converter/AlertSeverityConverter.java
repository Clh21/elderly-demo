package com.polyu.elderlycare.converter;

import com.polyu.elderlycare.entity.AlertSeverity;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = false)
public class AlertSeverityConverter implements AttributeConverter<AlertSeverity, String> {

    @Override
    public String convertToDatabaseColumn(AlertSeverity attribute) {
        return attribute == null ? null : attribute.getValue();
    }

    @Override
    public AlertSeverity convertToEntityAttribute(String dbData) {
        return dbData == null ? null : AlertSeverity.fromValue(dbData);
    }
}