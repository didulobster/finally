---
status: diagnosed
trigger: "UAT gap G-01-1: only watchlist on the left is showing and the header with status dot (expected full D-01 grid at 1600x1000)"
created: 2026-09-26T00:00:00Z
updated: 2026-09-26T01:55:00Z
goal: find_root_cause_only
---

## Current Focus

bug_class: Bohrbug (deterministic: the same image always serves the same pre-grid export; the HEAD build fails the same way every time)
hypothesis: CONFIRMED. The user viewed a container from the stale finally:latest image (built 2026-09-25 04:01Z, pre-grid), which was never rebuilt. Separately, HEAD cannot be rebuilt because commit 9745561 broke the frontend build.
next_action: diagnosis returned to caller (find_root_cause_only). Fix belongs to plan-phase --gaps.

reasoning_checkpoint:
  hypothesis: "The UAT page shows only header+watchlist because container 'finally' runs image a8ecec43 (finally:latest, built 2026-09-25T04:01:29Z from the 01-02 skeleton, 4 min before grid commit 57b1ed1). start_mac.sh reused it because the image existed and no build ran at the 01:29:59Z start."
  confirming_evidence:
    - "docker inspect: container image == finally:latest == a8ecec43, Created 04:01:29Z < 57b1ed1 04:05:11Z"
    - "curl localhost:8000 and docker exec grep: 0 occurrences of Heatmap/AI Assistant/Chart/Trade; static files dated 04:01Z"
    - "buildx history: no build record near 01:29Z (failed builds are recorded, as proven by the repro); post-grid builds were tagged finally-verify01 and test-finally, and test-finally contains the grid"
  falsification_test: "If finally:latest had been built after 04:05Z, or the served HTML contained Heatmap/AI Assistant, the hypothesis would be false. Neither holds."
  fix_rationale: "Rebuilding the 'finally' tag from a buildable HEAD directly replaces the stale export. First, HEAD must build (resolve the app/ vs src/ conflict from 9745561), or `--build` aborts."
  blind_spots: "The exact command the user typed is unknown (no shell history read). The logical proof (a HEAD build fails, and set -e would have prevented docker run) plus the buildx history make '--build was not used' near-certain. Not tested: whether reverting tsconfig and restoring zustand alone makes the root app/ build (fix territory)."
  candidate_causes:
    - "environment: stale local image finally:latest reused by start_mac.sh (CONFIRMED, direct cause)"
    - "code/config: commit 9745561 made HEAD unbuildable. tsconfig @/* -> ./src/*, root app/ still wins, src/ lacks ChatDrawer/PanelNote/store/lib, zustand removed, lib/ gitignored (CONFIRMED, blocks remediation)"
    - "build: Dockerfile copying stale frontend/out (ELIMINATED)"
    - "data: volume state (ELIMINATED)"
  and_gate: "The observed symptom needs only the stale image. Closing the gap needs both: repair the HEAD frontend build AND rebuild the 'finally' tag. A rebuild alone currently fails, and a fixed HEAD alone does nothing until the image is rebuilt."

## Symptoms

expected: Opening the app at 1600x1000 shows Header, Watchlist (left), Chart over Trade (center), AI Assistant drawer (right), Heatmap / P&L / Positions (bottom). Built with `scripts/start_mac.sh --build`.
actual: User reported "only watchlist on the left is showing and the header with status dot."
errors: None reported
reproduction: UAT Test 1 (.planning/phases/01-live-terminal-in-docker/01-UAT.md)
started: Discovered during UAT. Grid added in 57b1ed1 (01-03). Verifier saw full grid on a freshly built export.

## Eliminated

- hypothesis: The Dockerfile copies a stale frontend/out (or the wrong directory) into the image
  evidence: .dockerignore excludes frontend/out and frontend/.next. Stage 3 copies /frontend/out from the in-image `npm run build`. test-finally, built via the same Dockerfile after the grid, contains the grid.
  timestamp: 2026-09-26T01:47Z

- hypothesis: The committed grid code (frontend/app/page.tsx) lacks the D-01 panels, so the symptom comes from a correctly built but incomplete page
  evidence: HEAD's root app/page.tsx contains Watchlist/Chart/Trade/ChatDrawer/Heatmap/P&L/Positions. The served page came from an image built before that file changed. (HEAD does have a separate build-breaking defect, recorded in Evidence, but it is not what the user saw, because no build ran.)
  timestamp: 2026-09-26T01:51Z

- hypothesis: Next picked up the stray src/app/page.tsx (<Terminal/>) instead of the grid
  evidence: Next resolves ROOT app/ over src/app/ (the build log errors reference ./app/page.tsx). The running container predates the src/ tree anyway (static files dated 2026-09-25 04:01Z; src/ was committed 2026-09-26 00:45Z).
  timestamp: 2026-09-26T01:51Z

- hypothesis: data/volume state (finally-data) changes the layout
  evidence: the served index.html is static-export HTML with no grid panel titles, so the layout is fixed at build time and independent of DB contents.
  timestamp: 2026-09-26T01:43Z

## Evidence

- timestamp: 2026-09-26T01:40Z
  checked: git log / git show --stat 9745561 ("add frontend changes", 2026-09-26 08:45 +0800, by user)
  found: commit added a full frontend/src/ tree (src/app/page.tsx -> <Terminal/>, src/components/*, src/hooks/*), changed tsconfig paths "@/*" from "./*" to "./src/*", removed zustand from package.json deps, added lightweight-charts/vitest. Root frontend/app/page.tsx (D-01 grid from 57b1ed1) is still present and imports @/components/ChatDrawer and @/store/terminal.
  implication: two competing app trees; root app/ wins in Next, but its @/ imports now resolve into src/, where ChatDrawer.tsx and store/terminal.ts do not exist. HEAD build likely broken.

- timestamp: 2026-09-26T01:42Z
  checked: docker images finally / docker inspect finally (read-only)
  found: finally:latest = sha256:a8ecec43..., Created 2026-09-25T04:01:29Z (12:01:29 +0800). Grid commit 57b1ed1 = 2026-09-25 12:05:11 +0800. Running container "finally" created 2026-09-26T01:29:59Z from that same image.
  implication: the image the user tested predates the grid commit by ~4 minutes. No newer finally image exists.

- timestamp: 2026-09-26T01:43Z
  checked: curl http://localhost:8000/ and docker exec grep over /app/backend/static
  found: index.html (6854 bytes) contains "Watchlist" once and zero of Chart/Trade/Heatmap/P&L/Positions/AI Assistant/"arrives in Phase". Static files are all dated Sep 25 04:01; grep for Heatmap and "AI Assistant" = 0 files.
  implication: the running container serves the 01-02 walking skeleton (header + watchlist only), which exactly matches the user's report.

- timestamp: 2026-09-26T01:45Z
  checked: docker buildx history ls/inspect/logs (read-only); docker images
  found: most recent build is ~21h old (2026-09-25 12:12:49 +0800, VCS revision 56aa0d1, post-grid) and it was tagged "finally-verify01", not "finally". test-finally:latest (compose test image) created 12:12:25 +0800, post-grid. finally:latest is still the 12:01:29 image. No build record at all near the container start (2026-09-26 09:29:59 +0800); failed builds would also be recorded (status Error).
  implication: after the grid landed, every build used a throwaway/compose tag, so the user's `finally` image was never refreshed; the UAT container start at 09:29:59 did not run `docker build` (start_mac.sh skips build when image "finally" exists and --build is absent).

- timestamp: 2026-09-26T01:47Z
  checked: differential, `docker run --rm --entrypoint sh test-finally:latest` (throwaway, auto-removed) grep of /app/backend/static
  found: test-finally (built from source 2026-09-25 04:12Z, post-grid) has Heatmap in 2 files and "AI Assistant" in 2 files; index.html is 9683 bytes vs 6854 in the stale image.
  implication: the grid code at 57b1ed1..56aa0d1 builds and renders correctly. The fault is which image the user ran, not the grid code.

- timestamp: 2026-09-26T01:50Z
  checked: reproduced the HEAD build faithfully with `docker build --target frontend -t g011-debug-frontend .` (throwaway tag; failed, so no image was left behind)
  found: `npm run build` exits 1. "Turbopack build failed with 6 errors". Next builds ROOT ./app/page.tsx (root app/ takes precedence over src/app/), and its @/ imports now resolve via tsconfig "@/*": ["./src/*"]: Can't resolve '@/components/ChatDrawer'; Export PanelNote doesn't exist (src/components/Panel.tsx); Can't resolve '@/store/terminal'; src/components/Header.tsx and src/components/WatchlistRow.tsx: Can't resolve '@/lib/format'.
  implication: HEAD is unbuildable. `scripts/start_mac.sh --build` now aborts under `set -euo pipefail` before `docker rm`/`docker run`, so following the UAT instruction cannot deliver the grid until the frontend tree is repaired.

- timestamp: 2026-09-26T01:51Z
  checked: docker buildx history ls after the failed repro build; git check-ignore; git log 57b1ed1^..HEAD -- frontend Dockerfile .dockerignore scripts/start_mac.sh
  found: the failed repro build IS recorded (status Error), so the absence of any record near 01:29Z is meaningful. .gitignore:17 `lib/` (Python template) ignores frontend/src/lib/, and src/lib does not exist on disk, yet ~20 src/ imports use @/lib/*. zustand was dropped from package.json and package-lock.json while store/terminal.ts still imports it. 9745561 is the only frontend/Docker/script change since the grid.
  implication: (1) the UAT start skipped the build step. It could not have run a build: a HEAD build fails, and a failure would have exited the script before `docker run`, but a new container was created at 01:29:59Z. (2) The imported src/ tree is itself incomplete (missing lib/), so neither tree builds at HEAD.

- timestamp: 2026-09-26T01:52Z
  checked: 01-VERIFICATION.md lines 33, 179, 185
  found: the verifier already recorded "local Docker image finally:latest built at 04:01Z, before the grid (NO_GRID); start_mac.sh without --build reuses it and serves the pre-grid UI".
  implication: consistent with the stale-image finding. The verifier's "full grid" came from the finally-verify01/test-finally tags, never from `finally`.

## Resolution

root_cause: "(1) Direct cause: the UAT container runs the stale local image finally:latest (a8ecec43, built 2026-09-25T04:01Z from the 01-02 walking skeleton, before grid commit 57b1ed1). All post-grid builds used other tags (finally-verify01, test-finally), and the 2026-09-26T01:29:59Z start ran no build, so start_mac.sh reused the stale image, which serves only Header + Watchlist. (2) Blocking cause: commit 9745561 ('add frontend changes') made HEAD unbuildable, so `scripts/start_mac.sh --build` now fails (Turbopack, 6 errors) and cannot deliver the grid. It added a second app tree (frontend/src/) and repointed tsconfig '@/*' to './src/*'. Next still builds root app/page.tsx, whose imports now resolve into src/, where ChatDrawer, PanelNote, store/terminal and lib/* do not exist. It also removed zustand, which store/terminal.ts needs. Separately, .gitignore:17 'lib/' drops frontend/src/lib."
fix: (not applied; find_root_cause_only)
verification: (n/a)
files_changed: []
