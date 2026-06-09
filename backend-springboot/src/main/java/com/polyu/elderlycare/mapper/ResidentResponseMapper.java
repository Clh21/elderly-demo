package com.polyu.elderlycare.mapper;

import com.polyu.elderlycare.dto.ResidentResponse;
import com.polyu.elderlycare.entity.Resident;

public final class ResidentResponseMapper {

    private ResidentResponseMapper() {
    }

    public static ResidentResponse toResponse(Resident resident) {
        return new ResidentResponse(
                resident.getId(),
                resident.getName(),
                resident.getAge(),
                resident.getRoom(),
                resident.getWatchId(),
                resident.getEmergencyContact(),
                resident.getStatus().getValue()
        );
    }
}
