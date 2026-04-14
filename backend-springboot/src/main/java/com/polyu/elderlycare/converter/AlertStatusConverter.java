package com.polyu.elderlycare.converter;

import com.polyu.elderlycare.entity.AlertStatus;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = false)
public class AlertStatusConverter implements AttributeConverter<AlertStatus, String> {

    @Override
    public String convertToDatabaseColumn(AlertStatus attribute) {
        return attribute == null ? null : attribute.getValue();
    }

    @Override
    public AlertStatus convertToEntityAttribute(String dbData) {
        return dbData == null ? null : AlertStatus.fromValue(dbData);
    }
}