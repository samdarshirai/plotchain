package com.plotchain.epin;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface EPinRepository extends JpaRepository<EPin, UUID> {

    // epin-domain unit 1 (Decision 3): defensive collision re-check for EPinService's
    // generation loop, mirroring AssociateIdGenerator.generate()'s own re-check. The DB-level
    // UNIQUE constraint on code (migration V33) is the real guarantee; this is belt-and-braces.
    boolean existsByCode(String code);
}
