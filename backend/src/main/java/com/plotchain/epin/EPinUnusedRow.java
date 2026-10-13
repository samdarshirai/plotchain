package com.plotchain.epin;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

// One row of View New Pin / Transfer Pin. `code` is masked on the View New Pin list.
public record EPinUnusedRow(UUID id, String code, EPinType pinType, BigDecimal pinValue,
                            Instant transferDate, String transferBy) {}
