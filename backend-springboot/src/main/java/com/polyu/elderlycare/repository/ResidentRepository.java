package com.polyu.elderlycare.repository;

import com.polyu.elderlycare.entity.Resident;
import com.polyu.elderlycare.entity.ResidentStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ResidentRepository extends JpaRepository<Resident, Integer> {

    List<Resident> findByStatusNotOrderByRoomAsc(ResidentStatus status);

    Optional<Resident> findByWatchId(String watchId);

    long countByStatusNot(ResidentStatus status);
}