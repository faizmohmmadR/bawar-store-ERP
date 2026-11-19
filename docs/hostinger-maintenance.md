# Full guide — auto backup + activity log cleanup (Namecheap shared / cPanel)

This project is set up for **cheap shared hosting**.  
Primary target: **Namecheap shared hosting (cPanel)**.  
(Same steps also work on Hostinger-style panels.)

One nightly job keeps the ERP healthy without Celery or Redis.

Your production API (from this project): `https://api.mbz-hewad.com`  
Frontend: `https://mbz-hewad.com`

---

## 1. What runs every night

| Step | What happens | Default |
|------|----------------|---------|
| 1 | Create automatic DB backup file | `backups/auto_backup_YYYY-MM-DD_HH-MM-SS.sql` (MySQL) or `.db` (SQLite) |
| 2 | Delete **old automatic** backups | Keep last **30** days |
| 3 | Hard-delete old **activity logs** | Keep last **365** days |
| 4 | Purge expired **trash** | Same as existing trash retention |

**Manual backups** created from Settings → Backups are **never** auto-deleted.

In the ERP UI, Settings → Backups shows:

- **Manual** → `backup_…`
- **Automatic** → `auto_backup_…`

---

## 2. Deploy the code first (once)

Upload / pull these backend pieces to the server (same folder as `manage.py`):

- `account/maintenance.py`
- `account/backup.py` (updated)
- `account/urls.py` (adds `/api/maintenance/run/`)
- `account/management/commands/auto_backup.py`
- `account/management/commands/run_maintenance.py`
- `api/management/commands/purge_activity_logs.py`
- `backend/settings.py` (new env keys)
- `scripts/hostinger_cron.sh` (optional; shell cron)
- updated `.env` keys (below)
- frontend rebuild if you want the “Automatic / Manual” badge in Backups UI

Then **restart the Python app** in Namecheap cPanel:

- **Setup Python App** → your app → **Restart**  
  (or stop/start the application)

No new database migration is required for this feature.

---

## 3. Edit production `.env` on the server

Open the backend `.env` next to `manage.py` (not `frontend/.env`) and add:

```env
# Keep activity/audit logs for 1 year, then permanently delete
ACTIVITY_LOG_RETENTION_DAYS=365

# Keep automatic backups for 30 days, then delete auto files only
BACKUP_RETENTION_DAYS=30

# Strong secret for HTTP cron (required on Namecheap shared)
# Generate on any computer:
#   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
MAINTENANCE_CRON_SECRET=PASTE_LONG_RANDOM_SECRET_HERE
```

Optional:

```env
# Absolute folder for backup files (default = <project>/backups)
# BACKUP_DIR=/home/USERNAME/api.mbz-hewad.com/backups
```

**Important**

- Restart the Python app after changing `.env`.
- Do **not** commit the real secret to Git.
- If `MAINTENANCE_CRON_SECRET` is empty, the HTTP URL returns **503** (disabled on purpose).

Suggested values for a small ERP on Namecheap shared:

| Variable | Recommended | Notes |
|----------|-------------|--------|
| `ACTIVITY_LOG_RETENTION_DAYS` | `365` | Security/audit trail ~1 year |
| `BACKUP_RETENTION_DAYS` | `14`–`30` | Shared disk is limited |
| `MAINTENANCE_CRON_SECRET` | 32+ random chars | Treat like a password |

---

## 4. Namecheap shared — use HTTP cron (recommended)

On Namecheap shared hosting, shell Python cron is often awkward (wrong Python, wrong venv, Passenger path issues).  
**Call the API URL with curl** — the app itself creates the backup and cleans logs.

### 4.1 Confirm the endpoint works

From your laptop (replace the secret):

```bash
# Dry run — does NOT create/delete anything
curl -i -X POST "https://api.mbz-hewad.com/api/maintenance/run/?dry_run=1" \
  -H "Authorization: Bearer PASTE_LONG_RANDOM_SECRET_HERE"
```

Expected: HTTP **200** and JSON like:

```json
{
  "ok": true,
  "dry_run": true,
  "backup": { "skipped": true, "reason": "dry_run" },
  "backup_prune": { "deleted": 0, "retention_days": 30, "dry_run": true },
  "activity_logs": { "deleted": 0, "retention_days": 365, "dry_run": true },
  "trash": { "purged": 0, "dry_run": true },
  "errors": []
}
```

| Response | Meaning |
|----------|---------|
| **200** + JSON | Ready |
| **401** | Wrong secret |
| **503** | Secret empty / app not restarted |
| HTML “Please wait…” | Security/CDN challenge in front of API |

### 4.2 Real run once (manual)

```bash
curl -i -X POST "https://api.mbz-hewad.com/api/maintenance/run/" \
  -H "Authorization: Bearer PASTE_LONG_RANDOM_SECRET_HERE"
```

Then open ERP → **Settings → Backups**. You should see a new **Automatic** file.

### 4.3 Create the cron in Namecheap cPanel

1. Log in to **Namecheap** → hosting → **cPanel**
2. Search for **Cron Jobs**
3. Under **Add New Cron Job**:
   - **Common Settings:** `Once Per Day (0 0 * * *)`  
     or set minute=`0`, hour=`2`, day/month/weekday=`*` for **02:00 server time**
   - **Command:**

```bash
curl -fsS -X POST "https://api.mbz-hewad.com/api/maintenance/run/" -H "Authorization: Bearer PASTE_LONG_RANDOM_SECRET_HERE"
```

4. Click **Add New Cron Job**

If `curl` is missing on the server (rare), use:

```bash
/usr/bin/curl -fsS -X POST "https://api.mbz-hewad.com/api/maintenance/run/" -H "Authorization: Bearer PASTE_LONG_RANDOM_SECRET_HERE"
```

or:

```bash
wget -q -O - --method=POST --header="Authorization: Bearer PASTE_LONG_RANDOM_SECRET_HERE" "https://api.mbz-hewad.com/api/maintenance/run/"
```

### 4.4 Email from cron (optional)

In cPanel Cron Jobs, you can set a notification email.  
For quieter mail, append output discard:

```bash
curl -fsS -X POST "https://api.mbz-hewad.com/api/maintenance/run/" -H "Authorization: Bearer PASTE_LONG_RANDOM_SECRET_HERE" >/dev/null 2>&1
```

Better: keep mail on for the first week so you see failures.

### 4.5 Security / CDN challenge

If the API returns an HTML browser check instead of JSON, cron cannot pass it.

Ask Namecheap support (or disable the challenge on the API host) to allow non-browser API traffic for:

- `https://api.mbz-hewad.com/api/maintenance/run/`
- preferably all of `https://api.mbz-hewad.com/api/*`

Keep normal WAF / rate limits. Only remove interactive HTML challenges for the API hostname.

---

## 5. Optional — Shell cron (only if SSH Python works)

Use this only when `manage.py` runs correctly in Terminal / SSH.

Typical Namecheap path:

```text
/home/USERNAME/api.mbz-hewad.com/
  manage.py
  .env
  backups/
  scripts/hostinger_cron.sh
  venv/   or passenger virtualenv path from Setup Python App
```

```bash
chmod +x scripts/hostinger_cron.sh
./scripts/hostinger_cron.sh
tail -n 50 backups/maintenance.log
```

cPanel cron command example:

```bash
0 2 * * * /home/USERNAME/api.mbz-hewad.com/scripts/hostinger_cron.sh
```

On many Namecheap shared plans, **HTTP cron (§4) is more reliable** than shell Python.

---

## 6. Namecheap checklist (copy/paste)

| # | Where in cPanel | Action |
|---|-----------------|--------|
| 1 | File Manager / Git / FTP | Deploy backend files from §2 |
| 2 | File Manager → `.env` | Add retention + `MAINTENANCE_CRON_SECRET` |
| 3 | Setup Python App | **Restart** |
| 4 | Laptop `curl` | Test `?dry_run=1` then real POST |
| 5 | ERP → Settings → Backups | Confirm new **Automatic** backup |
| 6 | Cron Jobs | Daily `curl` command from §4.3 |
| 7 | Security / support | Exempt API from browser challenge if needed |
| 8 | Next morning | Check Backups list again |

---

## 7. Verify after the first night

1. **ERP UI:** Settings → Backups → newest row type **Automatic**
2. **Server folder:** `backups/auto_backup_….sql` (or `.db`) via File Manager
3. Optional dry-run anytime:

```bash
curl -fsS -X POST "https://api.mbz-hewad.com/api/maintenance/run/?dry_run=1" \
  -H "Authorization: Bearer YOUR_SECRET"
```

If backups get large, lower `BACKUP_RETENTION_DAYS` to `14`.

---

## 8. Manual commands (SSH / Terminal, if available)

```bash
cd /path/to/project

python manage.py run_maintenance
python manage.py run_maintenance --dry-run
python manage.py run_maintenance --json

python manage.py auto_backup
python manage.py purge_activity_logs --dry-run
python manage.py purge_activity_logs
python manage.py purge_trash --dry-run
```

Prefer the venv Python from **Setup Python App** if system `python` is wrong.

---

## 9. Security rules

- Never put the secret in the frontend `.env` or in public Git.
- Use **HTTPS** in the cron URL.
- Rotate `MAINTENANCE_CRON_SECRET` if it leaks; update the cPanel cron the same day.
- Endpoint is disabled when secret is empty.
- Endpoint does **not** use Django login; the Bearer secret is the lock.
- Do not make the `backups/` folder publicly downloadable; use ERP download (superuser).
- **Restore from Settings is disabled by default** (`BACKUP_RESTORE_ENABLED=False`).  
  Create + download + delete stay available. Only set `True` briefly if you must restore, then set `False` again and restart.

---

## 10. Troubleshooting (Namecheap)

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| HTTP **503** | Empty secret / no restart | Set `MAINTENANCE_CRON_SECRET`, Restart Python App |
| HTTP **401** | Wrong Bearer token | Match `.env` and cron command exactly (no extra spaces) |
| HTML challenge page | Bot protection on API host | Exempt `/api/*` for api subdomain |
| Cron mail says curl failed | Wrong URL / SSL / DNS | Test same command in cPanel Terminal |
| No new backup in UI | Old frontend or failed job | Redeploy frontend; check curl JSON body |
| Disk full | Too many auto backups | Set `BACKUP_RETENTION_DAYS=14`; delete old autos in Settings |
| `mysqldump` errors in shell cron | MySQL client missing in shell | Use **HTTP cron** instead |

---

## 11. Recommended setup for your Namecheap ERP

```env
ACTIVITY_LOG_RETENTION_DAYS=365
BACKUP_RETENTION_DAYS=30
MAINTENANCE_CRON_SECRET=<generated-secret>
```

cPanel → Cron Jobs → once daily:

```bash
curl -fsS -X POST "https://api.mbz-hewad.com/api/maintenance/run/" -H "Authorization: Bearer <generated-secret>"
```

That is enough: automatic backups, log cleanup after one year, and one simple Namecheap cron line.
