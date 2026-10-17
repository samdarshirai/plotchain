package com.plotchain.adminuser;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class AdminUserExceptionHandler {

    @ExceptionHandler(AdminUserException.class)
    public ResponseEntity<Map<String, String>> handle(AdminUserException ex) {
        return ResponseEntity.status(ex.getStatus()).body(Map.of("error", ex.getMessage()));
    }
}
