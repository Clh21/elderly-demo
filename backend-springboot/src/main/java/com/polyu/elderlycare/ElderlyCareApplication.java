package com.polyu.elderlycare;

import com.polyu.elderlycare.auth.AuthProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(AuthProperties.class)
public class ElderlyCareApplication {

    public static void main(String[] args) {
        SpringApplication.run(ElderlyCareApplication.class, args);
    }
}