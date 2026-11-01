# Feedback integration contract

`GET /feedback.json?q=...` searches open issues in the configured repository.
An empty search lists recently updated open issues. Pull requests are excluded.
The title search matches any of the first five distinct words of at least three
letters/digits; this is keyword matching, not semantic duplicate detection. The
user reviews linked results before choosing to create a distinct issue.

`POST /feedback.json` accepts `title`, `description`, `request_key`, `reviewed=1`,
and `confirm_new=1` after review. `POST /feedback/:issue/vote.json` adds one vote.
Both use the existing account session and CSRF checks. New issues receive the
submitter's first vote. Voting is additive; removing votes is outside this version.
The database primary key deduplicates repeated/concurrent votes. Submission UUIDs
prevent double-click/retry duplicates; five unique daily slots cap issue creation
per account per UTC database day. Accounts are not verified human identities.

When a create request has an uncertain outcome, the same UUID is refused rather
than creating another issue. The operator can match the `website-feedback:<id>`
marker in GitHub with the pending `feedback_submissions` row and recover its
`issue_number`. Do not delete pending rows or blindly resubmit. Changing draft
text creates a new request and should be done only after checking GitHub.

## Application settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `SR_FEEDBACK_ENABLED` | disabled | Set to `1` after configuration and migrations |
| `SR_FEEDBACK_REPO` | `Naphier/sightreading.training` | Fixed server-side target for search and writes |
| `SR_FEEDBACK_THRESHOLD` | `5` | Positive integer, once per issue |
| `SR_FEEDBACK_TOKEN_FILE` | none | Server-only secret file for a fine-grained GitHub token |
| `SR_FEEDBACK_TOKEN` | none | Alternative to the file; never supply both |

Use a dedicated fine-grained token limited to the target repository with Issues
read/write and Metadata read access. The token's authenticated user owns the vote
comments. It never reaches the browser. HTTP uses verified TLS with the system CA
bundle and bounded timeouts. The runtime needs `lua-resty-http 0.17.2-0`, outbound
HTTPS/DNS and an appropriate Nginx resolver. No user-provided URL is requested.

Run `lapis migrate` before enabling feedback. The application requires new
`feedback_issues`, `feedback_votes`, and `feedback_submissions` tables. The generic
Nginx config includes a worker-zero reconciliation timer; production runtimes
that replace this config must include the same timer and environment allowlist.
Private runtime provisioning and rollout instructions live in the operations repo.

## Delivery and alert behavior

Saved votes survive a GitHub outage. An atomic ten-minute per-issue lease avoids
concurrent comment writers. A background timer retries up to ten pending issues
per minute, with a one-minute backoff, and recovers expired leases after restart.
The database count is authoritative. A marker identifies the aggregate count
comment and the GitHub Actions bot uses a second marker for the threshold notification. Each writer scans
its own comments before posting, including after ambiguous network errors, and
never overwrites unrelated issue text. This greatly reduces duplicate alerts;
GitHub offers no transactional idempotency for comment creation, so an uncertain
remote write cannot have a strict exactly-once guarantee. After outages or a large
backlog the GitHub count and mention can lag behind saved votes. The UI reports
pending delivery. A generic error is logged without tokens or feedback text.

The `.github/workflows/feedback-alert.yml` workflow posts the separate alert as
`github-actions[bot]` so the owner's own runtime token does not suppress mention
notifications. It reacts to count-comment creation/edits, with an hourly recovery
scan of the 100 most recently updated issues and a manual issue-number option.
The workflow only trusts the repository owner's count comments by default; set
repository variable `FEEDBACK_BOT_LOGIN` if a dedicated user writes the comments.
Set `FEEDBACK_ALERT_LOGIN` for a recipient other than the repository owner.
For a dev feedback target, install this workflow and script in that test repository
as well. The workflow must be merged onto the target's default branch and Actions
enabled before count events can notify. GitHub may delay scheduled runs.

The alert is a separate comment mentioning the configured maintainer at five
website votes. Email delivery follows that user's GitHub notification preferences.
It is not sent again after further votes or threshold changes. Native GitHub
reactions do not contribute to the website threshold. Closed issues cannot receive
new website votes; votes already saved before closure can finish synchronization.
The scan stops at 1,000 comments and logs a pending failure for manual review if
it cannot safely discover the marker. Keep the bot's identity stable across token
rotation; changing it can require reconciling existing bot comments manually.

## Verification

The backend feedback specs use the disposable CI PostgreSQL database and a stub
GitHub HTTP client. They must never contact GitHub or a deployment database.
The normal full-stack CI command compiles MoonScript and runs these specs.
Full backend testing needs the repository CI image; the frontend-only preview
shows an explicit availability message instead of simulated feedback saves.
