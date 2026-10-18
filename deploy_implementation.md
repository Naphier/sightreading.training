# Manual dev/prd deployment implementation

This runbook implements the selected approach from [hosting_plan.md](hosting_plan.md): manually start workflows in a **private operations repository**, deploy to dev, then manually promote that tested release to production. There is no polling, no dispatcher in this public fork, and no GitHub App or Actions-write token to provision.

This document is an implementation map, not an already-installed deployment system. The private Dockerfiles, workflows and server helpers listed below still need to be built and tested. Do not run a production deployment until the first-release acceptance checks pass. No server access, repository creation, credentials or deployment are performed by this documentation PR.

## 1. Confirm the target values

Use this initial mapping unless the administrator changes it before provisioning:

| Item | Dev | Production |
| --- | --- | --- |
| Public hostname | `dev-sightreading.naplandgames.com` | `sightreading.naplandgames.com` |
| Stage identifier | `dev` | `prd` |
| Compose project | `sr-dev` | `sr-prd` |
| Application host port | `127.0.0.1:18081` | `127.0.0.1:18080` |
| Persistent PostgreSQL volume | `sr-dev_pgdata` | `sr-prd_pgdata` |
| Server configuration | `/etc/sightreading/dev/` | `/etc/sightreading/prd/` |
| CI SSH identity | `sr-dev-ci` | `sr-prd-ci` |
| Session cookie name | `sr_dev_session` | `sr_prd_session` |

Both stages run the full backend, with the same runtime image and production-style configuration; dev is not the frontend-only Codespaces server. Database credentials, session-signing secrets and data are independent. PostgreSQL is reachable only on each stage's private Docker network, never on a published host port.

Before provisioning, record privately: WHM account owner, OS/version, Apache/NGINX stack, Docker/Compose versions, server architecture, DNS provider, SSH endpoint/port, verified SSH host-key fingerprint, available memory/disk, GitHub plan and whether an authorized data export from the old site is available. Do not put actual connection credentials or account inventory in this public document.

**Owners:** the server administrator performs root/WHM setup and installs reviewed helpers; the maintainer implements the private deployment repository; `Naphier` operates the workflows and maintains the GitHub secrets. These may be the same person, but the credentials have different privileges.

## 2. Create the private operations repository

1. In GitHub, create `Naphier/sightreading-ops` as **Private**, initialize default branch `main`, and enable Actions. Keep this application repository public; no fork-visibility change is needed.
2. Limit write/admin access to the deployment operator and trusted maintainers. Protect/restrict changes to `main` where the GitHub plan permits it. Changes to workflows, scripts and container definitions require deliberate review even when GitHub cannot enforce reviewers on the chosen plan.
3. Set default workflow permissions to read-only. Individual jobs request only the extra permission they need. Pin third-party Actions to reviewed full commit SHAs and update them deliberately.
4. Create a private GHCR package owned by/linked to the operations repository when the first image is published. Explicitly confirm it is private and grant that repository Actions access to the package. Package settings and repository visibility must both be checked.
5. Put **all actual deployment implementation** in this private repo. The public application repository needs only generic production-readiness changes described in step 3; it gets no SSH key or dispatch secret.

Proposed private repository layout:

```text
.github/workflows/deploy-dev.yml        manual build, test and dev deployment
.github/workflows/promote-prd.yml       manual promotion of a successful dev run
.github/workflows/rollback.yml          manual selection of a prior trusted release
container/Dockerfile                    reproducible production build
container/entrypoint.sh                 serve / bootstrap / migrate commands
compose/compose.yml                     shared, stage-parameterized stack
server/sr-deploy-gate                   restricted SSH request parser
server/sr-apply-dev                     fixed-stage deployment entrypoint
server/sr-apply-prd                     separate fixed-stage deployment entrypoint
server/install.sh                      administrator-reviewed bootstrap installation
scripts/validate-source.sh             source SHA, ancestry and CI validation
scripts/build-and-test.sh               runtime-image integration checks
scripts/deploy.sh                       safe SSH client and bounded protocol
scripts/smoke.sh                        authenticated HTTPS checks
scripts/validate-release.sh             trusted run/artifact/digest verification
scripts/backup.sh                       PostgreSQL-consistent off-server backups
runbooks/                              actual host inventory, rotation, recovery
```

These are proposed files, not scripts available in this application checkout. Server installation is a separate reviewed administrator action; do not let a routine image deployment replace SSH rules, sudoers, Compose definitions or privileged helpers.

### Use GitHub Free without extra approval services

Manual `workflow_dispatch` is available for private repositories. Private environment secrets/reviewers have plan limitations, so the initial implementation can use repository secrets with `DEV_` and `PRD_` prefixes and separate manually invoked workflows. Add GitHub Environments if the account's plan supports the needed features; do not make an unavailable approval gate a prerequisite.

Both workflows must accept only `workflow_dispatch`, run only from `refs/heads/main`, and check **both** `github.actor` and `github.triggering_actor` against the operator allowlist (`Naphier` initially). This also checks who initiates a rerun. Use the appropriate expressions at job level so unauthorized jobs never receive deployment secrets. Do not define `push`, `schedule`, `repository_dispatch`, `workflow_run` or `pull_request_target` deployment triggers.

The owner uses GitHub's normal UI identity to start runs. Workflow jobs do not need an Actions-write secret to make this happen. The default job `GITHUB_TOKEN` is created automatically; use scoped read/package permissions as below. Protect access to the GitHub account, since someone controlling that account can operate these workflows.

## 3. Make the application production-ready

Complete these as ordinary app changes and review/merge them before selecting the first deployment SHA:

- Supply runtime configuration for DB host/name/user/password, per-stage session name/signing secret, public URL and writable runtime paths. Prefer protected secret files mounted at runtime, with an adapter reading them. None of these settings should be baked into an image layer or copied into public source.
- Set secure, host-only cookies with `HttpOnly`, `Secure` and appropriate `SameSite` flags. `app.moon` currently constructs cookie attributes directly, so relying on a generic Lapis setting alone is insufficient.
- Configure HTTPS URL generation and the trusted local proxy boundary. Verify cookies, CSRF, login and redirects through the actual hostname, not just an internal container port.
- Keep OpenResty in the foreground, listening on internal port `10007` (or an explicitly consistent replacement). The container must restart correctly and stop gracefully.
- Add useful readiness checks for application routing and database connectivity. Keep detailed database errors private; readiness is more than a listening socket.
- Stabilize full-backend CI. The existing Dockerfile invokes `ci.sh`, creates test databases and is not a production server. Do not deploy that image unchanged or bypass a failing CI requirement.

**Completion check:** start the candidate image locally with a disposable PostgreSQL instance, then exercise account registration/login, settings save/reload, hit upload and Stats. The existing frontend-only preview cannot validate these backend capabilities.

## 4. Implement the production image and database baseline

In the private repo, build from a reviewed full app commit SHA using a pinned build toolchain, stable Lapis/OpenResty/LuaJIT dependencies and a supported PostgreSQL major. A two-core standard Linux runner (`ubuntu-latest`) is appropriate for image builds; `ubuntu-slim` cannot run the Docker build and has a 15-minute job limit. Slim is optional for short validation jobs only. With no poller, compute is consumed only when a workflow is actually started.

The build must:

1. Fetch the fixed public application repository through public read access; reject arbitrary repository URLs. Clone/fetch `master` history, validate the requested SHA is a commit in that history, and checkout that exact SHA. Fetching a moving `master` after validation must not change the source being built.
2. Use `npm ci` and generate the parser, staff assets, guide JSON and complete production/minified assets. Compile the MoonScript backend and ensure runtime directories/files have appropriate service-user read/execute permissions. Earlier local CI failures included missing runtime Lua module paths and unreadable directories; integration-test the final image, not just its builder stage.
3. Copy only required runtime files. Exclude `.git`, build credentials, local `.env` files, tests/test databases and development outputs not needed in production. Run the app without root, Docker socket access or privileged container flags.
4. Provide explicit entrypoint operations: `serve`, `bootstrap` and `migrate`. These names are a contract to implement; they are not existing commands in this repo. All operations read the selected stage's runtime configuration. Bootstrap refuses to initialize a nonempty application schema. Migrate operates on that stage only and never clears data.
5. Define and test **one database baseline**. For this legacy repository, a practical starting point is the reviewed `schema.sql` including its `lapis_migrations` records, followed by outstanding migrations such as trainer preferences. Alternatively prove a clean migration-only baseline creates every required object. Do not load an existing schema while discarding its migration records and then replay all old migrations over it. The repository SQL contains hardcoded `OWNER TO postgres` statements: generate a reviewed no-owner/no-ACL baseline (for example, via a disposable restore and `pg_dump --no-owner --no-privileges`, retaining the migration-table data) so the intended non-superuser schema owner can bootstrap and migrate it. Do not grant the normal runtime user superuser just to make that import pass.
6. Test initial bootstrap, a repeat migration run (zero newly applied migrations), application behavior, container replacement and data persistence. Use an isolated test DB, not dev/prd data.
7. Push an immutable image to a fixed private package, for example `ghcr.io/naphier/sightreading-runtime`. Record its digest, full source SHA, operations SHA and build result. Tags are convenient labels; deployment uses `image@sha256:...`.

Use the same image for dev and prd. Inject stage secrets at runtime. Keep the PostgreSQL major pinned and do not combine an app release with an unplanned database major upgrade.

## 5. Prepare the WHM server

Follow the administrator-specific detail in [the WHM setup section](hosting_plan.md#whm-server-setup-administrator-checklist), in this order:

1. Inventory and back up the current host/web configuration; confirm resources and actual server architecture match the image build target. Docker being installed does not establish Compose, firewall rules or production readiness.
2. Add the two domains through cPanel and their A records at the authoritative DNS provider. Add AAAA only with working IPv6. Issue AutoSSL certificates and verify both domains before enforcing redirects.
3. Create protected per-stage configuration directories and backup staging outside `public_html`. Provision independent named DB volumes. Do not assume WHM account backups include those volumes.
4. Install reviewed, root-owned Compose/config templates. Use `sr-dev` and `sr-prd` consistently; app ports bind only to loopback. Leave PostgreSQL unexposed, retain the database service during app releases, and set bounded logs, restart policies and memory/CPU limits.
5. Add supported per-domain Apache userdata includes, or the corresponding configuration for the actual managed web stack. Preserve ACME/DCV handlers, route HTTPS to the appropriate loopback port and validate the web configuration before a supported reload. Do not replace WHM's listener on 80/443.
6. Put dev behind access control on the **proxied path**, not merely its document root. Test AutoSSL validation/renewal exceptions. Provide a narrowly scoped dev HTTP credential to automated smoke checks if needed.
7. Confirm external clients cannot reach 18080, 18081 or PostgreSQL on IPv4 or IPv6. Check Docker's actual firewall/localhost behavior rather than assuming a host firewall rule is sufficient.

The server's root-owned stage configuration should define at least:

| Setting | Requirement |
| --- | --- |
| Fixed registry/image path | Allowlisted private package, never user-supplied repository text |
| Compose project / host port / public URL | Fixed stage mapping from step 1 |
| DB name/user/password | Separate stage database; runtime user is not a PostgreSQL superuser |
| DB storage | Stable named volume; explicit backup and restore procedure |
| Session name/signing secret | Independent per stage; retained across container restarts |
| Writable application paths | Only the temp/PID/log paths needed by the runtime |
| Current/previous release records | Private, persistent records outside the app container |

Generate runtime secrets through a secure administrator process and write protected files; do not type secrets into commands that will be captured in shell history. Ordinary Compose file-backed secrets are not automatically encrypted. Ensure the container service UID can read its intended mounted files without making them globally readable.

For a new installation, the administrator starts the DB with its persistent volume, creates the stage's non-superuser application/migration identity and grants only the intended DB permissions, then invokes the reviewed image's bootstrap and migration operations. Subsequent releases run migrations only. Never use `ci.sh`, test fixtures or `docker compose down -v` against a stage database.

**Completion check:** the administrator can start the complete dev stack, reach it through its real HTTPS hostname, restart the app and still log in/read the same settings. Verify unrelated WHM sites remain healthy.

## 6. Set up temporary SSH deployment access

Use the restricted-SSH design in [hosting_plan.md](hosting_plan.md#5-create-restricted-expiring-deployment-access). Implement and review the gate/root helpers **before** authorizing a CI key.

The required server contract is:

- Separate `sr-dev-ci` and `sr-prd-ci` users, no password login, no Docker-group membership, no general sudo/shell/SFTP access.
- Root-managed public authorized-key files (root-owned, mode 0644 under a non-user-writable 0755 directory so sshd can read them while authenticating as the user), with a forced stage-specific command, `restrict` and a real server-enforced expiry. SSH keys do not expire just because their values are stored in GitHub Secrets.
- Root-owned helpers/configuration that the deployment user cannot edit. Each helper fixes its stage and registry/image path, validates the requested digest and release information, and rejects paths, extra commands, unrecognized input and cross-stage requests.
- Minimal no-argument sudo entrypoints with a bounded input protocol; both the unprivileged gate and privileged helper validate input. A JSON request on stdin can carry protocol version, digest, release identifier and a short-lived registry credential. Never use `eval` or shell-interpolate a caller-provided command.
- Stage-level locking, a pre-migration backup, one migration invocation, app-only replacement, health verification and an explicit success/failure response. Define an idempotent retry/reconciliation path for a dropped SSH connection; don't blindly start a second deployment when the first may still be running.

On a trusted administrator machine, generate one Ed25519 key per stage. Place the public key, restrictions and chosen UTC expiry on the server; upload the private key only through GitHub's secure secret UI. The prior plan contains example key generation, SSH Match rules, expiry options and narrowly scoped sudoers entries.

Verify SSH host-key fingerprints through the trusted WHM/admin console and create stage `known_hosts` files. For a nondefault SSH port, use the correct `[hostname]:port` known-hosts form. Require strict host-key checking. Do not disable verification or trust a fresh unauthenticated `ssh-keyscan` in CI.

Have the administrator run `sshd -t` and validate sudoers before reloading SSH. Keep the existing admin session open. Test that the intended deployment protocol succeeds while an interactive shell, SFTP, forwarding, expired credentials, malformed input and cross-stage commands fail. Restrict source IPs only where a genuine fixed-egress solution exists; normal GitHub-hosted runners do not have one small stable IP range.

**Completion check:** a dev-only key cannot access prd or run arbitrary Docker commands. Revoke bootstrap credentials after installation. Record key expiry privately; with rare deployments, it is reasonable to issue a new short-lived key immediately before a deployment instead of maintaining permanent access.

## 7. Add GitHub configuration and secrets

In the **private operations repo**, open **Settings → Secrets and variables → Actions**. For a Free account, use repository-level values with explicit stage prefixes. On a plan with suitable environments, use environment-scoped secrets instead and adapt workflow references deliberately.

| Name | Type | Purpose |
| --- | --- | --- |
| `DEV_SSH_HOST`, `DEV_SSH_PORT`, `DEV_SSH_USER` | Variables or private configuration | Connection to the dev gate |
| `DEV_SSH_PRIVATE_KEY` | Secret | Current temporary dev key |
| `DEV_SSH_KNOWN_HOSTS` | Secret or integrity-protected private configuration | Verified host key, not a dynamically trusted scan |
| `PRD_SSH_HOST`, `PRD_SSH_PORT`, `PRD_SSH_USER` | Variables or private configuration | Separate production gate connection |
| `PRD_SSH_PRIVATE_KEY` | Secret | Current temporary production key |
| `PRD_SSH_KNOWN_HOSTS` | Secret or integrity-protected private configuration | Verified production host key |
| `DEV_HTTP_USER`, `DEV_HTTP_PASSWORD` | Secrets, if dev access control uses them | External dev smoke checks |
| Stage-specific smoke account values | Secrets as needed | Dedicated app test accounts; never real user credentials |

DB passwords and signing secrets stay in protected server runtime files; deploy jobs do not need to copy them on every release. WHM/root credentials are for administrator bootstrap, not routine CI secrets.

Use the automatically issued `GITHUB_TOKEN` for the private package, with explicit job permissions. Give publishing jobs `packages: write`; give deployment/promotion jobs `packages: read`; jobs that inspect prior run metadata/artifacts need `actions: read`. Keep `contents: read` for checkout. No dispatch App/private key/PAT is required in either repo, and no job needs `actions: write` merely to deploy over SSH.

The host uses a short-lived package-read job token supplied through encrypted SSH stdin for the image pull. Use `docker login --password-stdin` with an isolated root-owned temporary credential directory, then remove that directory after the transaction. Do not pass the token as a process argument, save it in Compose or leave it in the host's default Docker config. A rollback workflow supplies a fresh token if a pull is needed. Already-downloaded images restart without logging in again.

The SSH client script must create private temporary key/known-host files with restrictive permissions, use batch mode and strict host checking, send only the reviewed protocol, and clean up files on exit. Do not enable `set -x` or credential-bearing verbose HTTP/SSH diagnostics.

## 8. Implement the manual dev workflow

Commit `deploy-dev.yml` to **the private repo's default branch** so GitHub shows **Run workflow**. Its only required release input is `app_sha`, the full 40-character commit SHA from the public app's protected `master` history. Do not accept repository URLs, arbitrary commands, Compose paths or a stage selector.

Implement these jobs, with the operator/default-branch authorization check on every privileged job:

| Job | Runner / permissions | Required behavior |
| --- | --- | --- |
| Validate | `ubuntu-slim` or standard Linux; repository read, plus only the API reads needed | Validate SHA syntax, fixed source repository, ancestry and required successful CI for that exact SHA. Verify CI workflow identity/event/branch rather than accepting any check named “test”. Fail closed if CI is absent/failed. Use public read endpoints for public source/CI metadata; do not assume this private repo’s token grants cross-repository privileges. If anonymous API reads are rate-limited, stop rather than bypass validation or request a write token. Pass only validated values onward. |
| Build and publish | Standard Linux with Docker; `contents: read`, `packages: write` | Checkout the exact validated source plus reviewed ops code. Build and integration-test the runtime image, then publish and return its digest. Do not pass SSH keys to this job. |
| Deploy dev and verify | Standard Linux; `contents: read`, `packages: read` | Use only `DEV_` secrets. Invoke the dev gate with a validated digest, wait for its transaction outcome, then verify internal readiness and external authenticated HTTPS behavior. |
| Record successful release | Following successful deployment and checks | Store the manifest below in the private run's artifact and persistent private release records. A partially deployed or failed run is not promotable. |

Use a fixed dev concurrency group with `cancel-in-progress: false`, plus the server-side lock. Individual jobs should have timeouts; do not cancel a migration transaction simply because another run was queued. Require all prerequisite jobs to succeed; no `continue-on-error` around migrations, deployment or smoke checks.

A proposed successful-dev manifest:

```json
{
  "schema_version": 1,
  "source_repository": "Naphier/sightreading.training",
  "source_sha": "<40-character validated app SHA>",
  "operations_sha": "<40-character ops SHA used by this run>",
  "image_repository": "ghcr.io/naphier/sightreading-runtime",
  "image_digest": "sha256:<64 lowercase hex characters>",
  "dev_run_id": "<GitHub run ID>",
  "dev_run_attempt": 1,
  "dev_checks_passed": true
}
```

This example contains placeholders and is not a valid release record. The trusted workflow generates the real record from validated outputs; never accept one uploaded by a requester. Record deployment timestamps and migration outcomes alongside it. Use an artifact name incorporating the run attempt (for example `release-1`) so promotion selects the verified attempt, not an arbitrary older artifact. Keep the small manifest artifact for an explicit retention period, for example 90 days, and preserve private server release history as well. Preserve the corresponding image digest from cleanup while it is current or rollback-eligible.

### Dev gate transaction

The implemented helper should execute this sequence under its lock:

1. Validate the request, allowlisted image/digest and trusted release metadata; reject expired/invalid auth before changing anything.
2. Pull the exact image using the temporary registry credential; keep the currently working app running if the pull fails.
3. Confirm the persistent DB is healthy. Bootstrap only an explicitly new/empty stage using the reviewed initialization path; otherwise migration-only operation is mandatory.
4. Take a consistent backup and confirm success before changing schema. Run migrations from the candidate release once. Stop if they fail, and assess whether old-app/schema compatibility still holds.
5. Replace only the app service with the selected image. Do not recreate/delete its DB volume or stop every Compose service as a routine release step.
6. Verify readiness and return a structured status. Save the previous/new digest and transaction ID. If verification fails, apply the documented compatible-image rollback; do not automatically reverse migrations or restore a database over live writes.

A dropped connection is an unknown outcome, not evidence that nothing happened. The private client needs a bounded status/retry operation that can reconcile the transaction ID without giving the key a general-purpose shell.

## 9. Implement production promotion and rollback

`promote-prd.yml` is a separate manual workflow. Its input is a successful **dev workflow run ID**, not arbitrary image text. It uses only `PRD_` connection secrets and the same strict operator/default-branch checks.

Before requesting production access, it must:

1. Validate a numeric run ID and fetch that run from the fixed operations repo. Require the expected `deploy-dev.yml` identity, allowed event/ref, successful conclusion and selected successful attempt.
2. Download only that run's expected release artifact, validate its schema and bind the run ID/attempt, source SHA, ops SHA and digest to trusted build/deployment records. Do not trust `dev_checks_passed: true` in arbitrary JSON by itself. Preserve artifact integrity using the validated private run/producer and available artifact digests; fail on mismatch.
3. Confirm the image still exists in the fixed private package and that its source/build provenance matches the recorded release. Production must use **the exact dev-tested digest**, not rebuild from the app SHA or replace it with a mutable tag.
4. Reject expired/missing artifacts or incomplete dev checks. If a record has expired, run dev deployment/checks again or use an explicitly verified durable release record; never fall back to an operator-supplied digest with no evidence.
5. Acquire production concurrency/host locks, take and verify a production backup, run compatible migrations once, replace only the app, and perform external HTTPS checks. Write a production release record and show the result in the private job summary.

An automatic dev run does not start production: the operator must select **Run workflow** on promotion. GitHub environment reviewers, if available, can add another gate; on Free, the separate owner-only manual workflow and trusted private code are the initial authorization boundary.

Implement `rollback.yml` before the first production launch. It selects a prior trusted stage release and supplies a fresh package-read token if necessary. Verify schema compatibility before restoring an older app image. Database restore is a separate administrator recovery operation requiring stopped writes and an explicit recovery point; it can lose activity since the backup. Never attach `down -v` or automatic destructive down-migrations to a rollback button.

## 10. First launch and acceptance checks

1. Install/review the private implementation, complete app prerequisites and stabilize CI. Test it with disposable containers and databases first; do not call a stubbed or mocked deployment production-ready.
2. Provision dev server resources and short-lived dev access. Dispatch a known-good `master` SHA through **Deploy dev**.
3. Check the dev URL, then verify: registration/login/logout; cookie flags and CSRF rejection; preference restore in two authenticated browsers; hit uploads/Stats; keyboard/reset/Last Streak; supported song routes; browser MIDI/audio over HTTPS.
4. Replace/restart the dev app container and confirm account data remains. Test stage isolation, invalid/expired credentials, rejected cross-stage requests, rejected shell access and private package visibility.
5. Schedule consistent DB backups with encrypted off-server storage. Perform a restore drill into an isolated DB and verify the restored account behavior. Confirm that WHM backup configuration actually covers any intended app files, and that DB backups are covered separately.
6. Decide whether to import an authorized export from the old maintainer. If unavailable, initialize a fresh DB and communicate that old accounts/data are not transferred. Existing browser localStorage on another origin is not migrated automatically.
7. Provision production configuration and temporary access. Perform a failed-release/compatible-rollback exercise before accepting real traffic. Then promote the successful dev run, inspect the real production URL and confirm no other WHM sites were disturbed.
8. Verify persistence after a planned server reboot, AutoSSL renewal handling, disk/log growth and monitoring. Retain verified off-server backups and a usable previous digest. Revoke temporary bootstrap access and document the next key expiration/rotation date.

Do not promise zero downtime: a simple single-app replacement can briefly interrupt requests. Breaking schema changes require a maintenance plan; blue/green app deployment can be added later if needed.

## 11. Instructions for each routine release

### Deploy to dev from GitHub

1. Merge the intended application change into `master` and wait for its required CI to pass. Copy its **full commit SHA** from the commit page; do not type a shortened hash or assume “latest”.
2. If the dev SSH key has expired, issue/restrict a new temporary dev key on the server and replace `DEV_SSH_PRIVATE_KEY` securely. If the host key changed, investigate and verify it through the admin console before updating known-host data.
3. Open **Naphier/sightreading-ops → Actions → Deploy dev → Run workflow**.
4. Choose workflow branch **main**, paste `app_sha`, and select **Run workflow**. Wait for validation, build, deployment and external checks to succeed.
5. Read the private summary for the deployed SHA/digest and dev URL. Test dev, then copy that successful run's ID from the run URL/summary.

### Promote to production

1. Confirm the selected dev run is the intended tested release. Issue/rotate temporary production access if needed; confirm backups are current and the migration is compatible.
2. In the private repo, select **Actions → Promote prd → Run workflow**, branch **main**.
3. Enter the successful `dev_run_id` and start the workflow. It verifies the record and deploys that exact image; it does not build another one.
4. Inspect the production result and real URL. If checks fail, use the recovery procedure; do not repeatedly click Run workflow without reconciling the existing transaction.
5. Revoke a deliberately one-use/short-window key after completion, or leave its enforced expiry/rotation record in place as agreed. Keep normal runtime secrets unchanged across releases unless performing a planned rotation.

No polling job is billed between releases. Started jobs consume private Actions minutes; artifact/image storage and backups can still incur storage costs while retained. Existing app CI is separate and continues to use whatever triggers that repo has configured.

## Failure quick reference

| Symptom | Next action |
| --- | --- |
| No **Run workflow** button | Confirm the private workflow exists on default branch `main`, defines `workflow_dispatch`, Actions is enabled and your account has the needed repository access. |
| Ref/operator rejected | Select `main` and use the authorized account. Do not weaken checks to make a bot or untrusted branch work. |
| Source CI missing/failed | Fix or rerun the correct app CI for that exact SHA; deployment must not silently skip it. |
| SSH permission denied | Check stage username, public/private key pair, enforced expiry and server authorization logs. Do not fall back to root/password access. |
| SSH host-key mismatch | Verify through the trusted server console before changing known-host data; do not disable checking. |
| Private image pull denied | Confirm package visibility/access and job `packages: read`; verify the temporary login flow without logging the token. |
| HTTPS 502 | Check the stage app's readiness/logs and the WHM loopback upstream port; forwarding/proxy configuration alone does not start a server. |
| Migration fails | Stop the release and inspect the exact DB/schema error. Do not rerun bootstrap over existing data or delete the volume. |
| SSH disconnect/timeout | Reconcile the recorded server transaction outcome before retrying. |
| Dev artifact expired | Re-run dev/checks or use a verified durable record; do not bypass promotion validation. |
| Container restart loses users | Stop accepting new writes and investigate volume/project naming and backups. A correct deployment must retain DB data. |

## References and status

[hosting_plan.md](hosting_plan.md) contains the GitHub visibility/workflow research, WHM/SSH examples, source references and research limitations. Relevant GitHub references are [manual workflow dispatch](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-running-a-workflow), [job token permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions), [package access for Actions](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility) and [single-CPU runner limits](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#single-cpu-runners).

This runbook is documentation-only. The actual WHM stack, production image, SSH helpers and workflow behavior still need implementation and validation. The selected design deliberately avoids the public-to-private dispatcher and poller discussed as alternatives in the earlier plan.
