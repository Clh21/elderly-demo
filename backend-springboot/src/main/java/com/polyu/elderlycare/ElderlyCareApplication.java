package com.polyu.elderlycare;

import com.polyu.elderlycare.auth.AuthProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableConfigurationProperties(AuthProperties.class)
@EnableScheduling
public class ElderlyCareApplication {

    public static void main(String[] args) {
        SpringApplication.run(ElderlyCareApplication.class, args);
    }
}
