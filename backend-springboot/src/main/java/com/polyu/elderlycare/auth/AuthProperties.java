package com.polyu.elderlycare.auth;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.auth")
public class AuthProperties {

    private Duration tokenTtl = Duration.ofHours(12);
    private final List<Account> accounts = new ArrayList<>();

    public Duration getTokenTtl() {
        return tokenTtl;
    }

    public void setTokenTtl(Duration tokenTtl) {
        this.tokenTtl = tokenTtl;
    }

    public List<Account> getAccounts() {
        return accounts;
    }

    public static class Account {

        private String username;
        private String password;
        private String displayName;
        private AppRole role = AppRole.RESIDENT_VIEWER;
        private Integer residentId;
        private String residentName;
        private String watchId;

        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
        }

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }

        public String getDisplayName() {
            return displayName;
        }

        public void setDisplayName(String displayName) {
            this.displayName = displayName;
        }

        public AppRole getRole() {
            return role;
        }

        public void setRole(AppRole role) {
            this.role = role;
        }

        public Integer getResidentId() {
            return residentId;
        }

        public void setResidentId(Integer residentId) {
            this.residentId = residentId;
        }

        public String getResidentName() {
            return residentName;
        }

        public void setResidentName(String residentName) {
            this.residentName = residentName;
        }

        public String getWatchId() {
            return watchId;
        }

        public void setWatchId(String watchId) {
            this.watchId = watchId;
        }
    }
}