# Workspace Cleanup Notes

## Completed now

- Removed generated frontend build output folder:
  - frontend/build/
- Removed temporary doc extraction folder:
  - indoor-positioning/docs/_docx_extract_tmp/
- Removed runtime MQTT bridge lock directories:
  - backend-springboot/elderlycare-position-bridge-*/
- Added ignore rules in .gitignore for:
  - backend-springboot/elderlycare-position-bridge-*/
  - indoor-positioning/docs/_docx_extract_tmp/

## Suggested next cleanup (manual decision)

1. Backend consolidation
- Current repo contains two backends:
  - backend/ (legacy Node/Express)
  - backend-springboot/ (current integrated backend)
- If Spring Boot is your final stack, consider moving backend/ to archive/backend-node-legacy/ to reduce confusion.

2. Frontend package manager lock
- frontend has both package-lock.json and yarn.lock.
- Keep one lock file based on your actual package manager to avoid dependency drift.

3. Data/log sample placement
- simulator.py and watch_payloads.jsonl are in repo root.
- Consider creating tools/simulator/ and moving both files there for cleaner root layout.

4. Document naming normalization
- indoor-positioning/docs/Interim Report(1)(1).docx has repeated suffix and spaces.
- Consider renaming to docs/interim-report.docx for easier scripting and references.

## Recommended final top-level structure

- backend-springboot/
- frontend/
- indoor-positioning/
- ecg_analysis/
- tools/            (optional: simulator and helper scripts)
- docs/             (optional: shared reports)

