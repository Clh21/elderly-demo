package com.polyu.elderlycare.converter;

import com.polyu.elderlycare.entity.ResidentStatus;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = false)
public class ResidentStatusConverter implements AttributeConverter<ResidentStatus, String> {

    @Override
    public String convertToDatabaseColumn(ResidentStatus attribute) {
        return attribute == null ? null : attribute.getValue();
    }

    @Override
    public ResidentStatus convertToEntityAttribute(String dbData) {
        return dbData == null ? null : ResidentStatus.fromValue(dbData);
    }
}