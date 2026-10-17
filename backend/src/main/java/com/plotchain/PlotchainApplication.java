package com.plotchain;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class PlotchainApplication {
    public static void main(String[] args) {
        SpringApplication.run(PlotchainApplication.class, args);
    }

    // TEMPORARY: V57 was edited after being applied; repair updates its checksum. Remove after one successful deploy.
    @org.springframework.context.annotation.Bean
    org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy repairThenMigrate() {
        return flyway -> {
            flyway.repair();
            flyway.migrate();
        };
    }
}
