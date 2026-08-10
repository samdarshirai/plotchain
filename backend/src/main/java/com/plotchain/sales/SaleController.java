package com.plotchain.sales;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/sales")
public class SaleController {

    private final SaleService saleService;

    public SaleController(SaleService saleService) {
        this.saleService = saleService;
    }

    @PostMapping
    public ResponseEntity<SaleResponse> record(@Valid @RequestBody CreateSaleRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(saleService.recordSale(request));
    }

    @PostMapping("/{id}/void")
    public ResponseEntity<SaleResponse> voidSale(
            @PathVariable UUID id, @RequestBody VoidSaleRequest request) {
        return ResponseEntity.ok(saleService.voidSale(id, request));
    }
}
