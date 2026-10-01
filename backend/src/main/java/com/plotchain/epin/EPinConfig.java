package com.plotchain.epin;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class EPinConfig {
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
