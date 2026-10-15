# Publishing source safely

Keep provider keys, private settings, generated media, account databases, deployment records and local machine details outside the source tree. Git, Docker and Vercel exclusions cover these runtime folders and common credential/export formats. Exclusions do not remove something already committed.

Before publishing, initialize the pinned source submodules (`git submodule update --init`) and install a verified local Gitleaks binary. Set `GITLEAKS_BIN` to its path or set a repository-local `highfield.gitleaksBin`. The check does not install tools or upload source. It fails when a required scanner or source checkout is missing.

Run `npm run privacy:check` to scan tracked and unignored new files, including pinned source trees. Run `npm run privacy:history` to additionally scan every available reachable Git commit. Its summary reports shallow history explicitly: older submodule history is outside that check. Reports are redacted and temporary exports are deleted after the scan. A successful check is evidence for the inspected source, not a guarantee against all private information.

For an additional exact-value check, set `PRIVACY_DENYLIST_FILE` or a repository-local `highfield.privateDenylistFile` to an external JSON array of private strings (minimum eight characters). Never commit that file. The check reports matching filenames and rule names without the strings themselves. Do not add actual credentials to test fixtures.

Enable the supplied local pre-push check with `git config --local core.hooksPath .githooks`. This applies only to this checkout. Other contributors must enable their own checks. Do not bypass a finding without reviewing it. `scripts/privacy-baseline.json` documents one upstream dummy example, constrained by immutable commit or full file hash plus source, line and rule; it does not suppress a directory or a whole scanner rule.

Browser/MCP job responses expose explicit public fields and authenticated media handles. Provider operation objects, signed upstream output URLs, raw provider errors and server filesystem paths stay in the private job store. This deployment uses one owner workspace; separate user accounts and authorization remain tracked work.
