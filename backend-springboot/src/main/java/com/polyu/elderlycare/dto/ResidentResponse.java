package com.polyu.elderlycare.dto;

public record ResidentResponse(
        Integer id,
        String name,
        Integer age,
        String room,
        String watchId,
        String emergencyContact,
        String status
) {
}