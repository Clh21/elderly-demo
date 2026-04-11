package com.polyu.elderlycare.converter;

import com.polyu.elderlycare.entity.AlertType;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = false)
public class AlertTypeConverter implements AttributeConverter<AlertType, String> {

    @Override
    public String convertToDatabaseColumn(AlertType attribute) {
        return attribute == null ? null : attribute.getValue();
    }

    @Override
    public AlertType convertToEntityAttribute(String dbData) {
        return dbData == null ? null : AlertType.fromValue(dbData);
    }
}