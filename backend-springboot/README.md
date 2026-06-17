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
- automatic daily health analysis API
- ingestion-driven health alert evaluation with sustained-sample checks
- MQTT bridge for AI-reviewed indoor alerts
- demo startup seed and alert enum compatibility logic
- global exception handling
- database entity mapping for core tables
- service interfaces with implementation classes under `service/impl`

Still worth improving:

- move more complex JDBC query logic into smaller domain-specific repository classes if the codebase keeps growing
- add Maven Wrapper so the project can build without a machine-wide Maven install
- add integration tests for `/api/watch/{watchId}` and `/api/samsung-watch`

## Indoor positioning integration

This backend includes an MQTT-to-SSE bridge for BLE indoor positioning.

- MQTT source topic (default): `indoor/location/target_01`
- REST endpoint: `/api/position/latest`
- SSE endpoint: `/api/stream/position-updates`

Config keys in `application.yml`:

- `app.mqtt-broker.auto-start` (starts local Mosquitto with Spring Boot by default)
- `app.mqtt-broker.executable`
- `app.mqtt-broker.config-file`
- `app.positioning.enabled`
- `app.positioning.mqtt-host`
- `app.positioning.mqtt-port`
- `app.positioning.mqtt-topic`
- `app.positioning.mqtt-client-id`
- `app.positioning.mqtt-username`
- `app.positioning.mqtt-password`

On Windows, starting Spring Boot now checks `127.0.0.1:1883` and starts
Mosquitto automatically when needed. To use an external broker instead:

```powershell
$env:MQTT_BROKER_AUTO_START="false"
$env:POSITIONING_MQTT_HOST="192.168.1.10"
```

## Daily health analysis and alerts

- Daily analysis endpoint: `GET /api/watch/{watchId}/health-analysis?date=yyyy-MM-dd`
- Omitting `date` analyzes the current local day.
- The response always includes rule-based analysis. If `ZHIPU_API_KEY` is set,
  the aggregate summary is additionally rewritten by GLM.
- Health alerts are evaluated when watch data is ingested. Heart rate and
  temperature require repeated abnormal readings; EDA requires a sustained
  session instead of a single high sample.
- Physiological readings are ignored while the latest explicit state says the
  watch is not worn or charging.

Optional AI environment variables:

```powershell
$env:ZHIPU_API_KEY="your-key"
$env:ZHIPU_MODEL="glm-4-flash"
$env:AI_ANALYSIS_ENABLED="true"
```

## High-heart-rate simulator and email

The backend subscribes to `indoor/simulation/heart-rate`. While the simulator
is active, the dashboard shows the simulated heart rate as critical without
writing it into the watch reading tables. Releasing it restores the latest
real watch value and re-runs the normal heart-rate alert rules.

Start the interactive simulator from `indoor-positioning/`:

```powershell
python heart_rate_alert_simulator.py
```

Use `high`, `high 155`, `normal`, `status`, and `quit`. One-shot commands are
also available:

```powershell
python heart_rate_alert_simulator.py --bpm 155 --activate
python heart_rate_alert_simulator.py --clear
```

Email is sent only when the high-heart-rate simulation changes from inactive
to active. Fill in the Git-ignored local configuration file:

```properties
# backend-springboot/config/email-local.properties
app.email-alert.heart-rate-enabled=true
app.email-alert.to=recipient@example.com
spring.mail.username=your-account@gmail.com
spring.mail.password=your-16-digit-app-password
```

Use a personal Gmail account with Google 2-Step Verification enabled. Create an
app password at `https://myaccount.google.com/apppasswords`, name it
`Elderly Care Demo`, and use the generated 16-character value as
`spring.mail.password`. Do not use the normal Google account password. Port 587 and
STARTTLS are not used because the current network blocks port 587. Port 465 with
implicit SSL is configured instead. The sender address defaults to
`spring.mail.username`.
A one-off recipient can be supplied with `--email recipient@example.com`.

After restarting Spring Boot, verify that the startup log reports
`enabled=true`, `senderConfigured=true`, `passwordConfigured=true`, and
`recipientConfigured=true`.

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
