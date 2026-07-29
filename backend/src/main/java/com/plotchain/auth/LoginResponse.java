package com.plotchain.auth;

import java.util.UUID;

public record LoginResponse(String token, UUID associateId, String role) {}
