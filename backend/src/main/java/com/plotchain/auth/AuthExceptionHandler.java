package com.plotchain.auth;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class AuthExceptionHandler {

    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<Map<String, String>> handleInvalidCredentials(InvalidCredentialsException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", ex.getMessage()));
    }

    // Bean-validation failures (MethodArgumentNotValidException) are handled application-wide
    // by com.plotchain.api.ApiExceptionHandler, which reports which field failed instead of a
    // login-specific message. Do not add a handler for it here: a second advice matching the
    // same exception type makes resolution order-dependent.
}
