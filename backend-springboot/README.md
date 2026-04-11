# Spring Boot Backend

This module is a Spring Boot replacement for the current Node.js backend.

## Why the current backend looks messy

The existing backend under `backend/` is a small Express prototype:

- `package.json` defines an Express server with `cors` and `mysql2`
- `index.js` contains route handling, SQL, business rules, ECG analysis, and server bootstrap in one file
- there is no MVC layering, so controllers, services, repositories, and models are mixed together

That structure is fast for prototyping, but it becomes hard to maintain once the API grows.

## This module uses a standard Spring Boot MVC layout

```text
backend-springboot/
  pom.xml
  src/main/java/com/polyu/elderlycare/
    config/
    controller/
    dto/
    entity/
    exception/
    repository/
    service/
      impl/
    startup/
    ElderlyCareApplication.java
  src/main/resources/
    application.yml
```

## Current migration status

Implemented:

- resident listing API
- health history API
- alerts APIs
- system stats API
- watch summary API
- Samsung watch ingestion API
- legacy watch-reading ingestion API
- ECG history APIs
- metric-detail API
- demo startup seed and alert enum compatibility logic
- global exception handling
- database entity mapping for core tables
- service interfaces with implementation classes under `service/impl`

Still worth improving:

- move more complex JDBC query logic into smaller domain-specific repository classes if the codebase keeps growing
- add Maven Wrapper so the project can build without a machine-wide Maven install
- add integration tests for `/api/watch/{watchId}` and `/api/samsung-watch`

## Run

Set database environment variables if needed:

```powershell
$env:DB_HOST="localhost"
$env:DB_PORT="3306"
$env:DB_NAME="elderly"
$env:DB_USERNAME="root"
$env:DB_PASSWORD="your-password"
```

Then start with Maven:

```powershell
mvn spring-boot:run
```

If Maven is not installed, install Maven first or add the Maven Wrapper later.