package com.plotchain.epin;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record EPinUsedRow(UUID id, String code, EPinType pinType, BigDecimal pinValue,
                          Instant transferDate, Instant usedDate, String usedByUserId, String usedByName) {}
