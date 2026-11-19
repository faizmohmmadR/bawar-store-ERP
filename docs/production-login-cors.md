# Production login preflight

The public OPTIONS request to `https://api.mbz-hewad.com/api/login/`, tested with origin `https://mbz-hewad.com`, returned HTTP 200 with `Content-Type: text/html`, `Server: openresty/1.31.1.1`, no `Access-Control-Allow-Origin`, and an HTML page titled "One moment, please..." saying "Please wait while your request is being verified...". This is a hosting/edge verification page rather than a Django CORS response. The exact security product responsible was not identified.

Django already installs `corsheaders` and places `CorsMiddleware` first. An explicit frontend allowlist is sufficient when requests reach that application. Do not add wildcard CORS or disable authentication to work around a response generated before Django.

## Hosting correction

In the hosting security/CDN controls, exempt the JSON API hostname/path from interactive JavaScript/browser verification. This applies to OPTIONS and actual API requests: an XHR cannot complete an HTML browser challenge. Keep ordinary WAF rules, authentication and rate limits enabled. If these controls are unavailable, send the hosting provider this request:

> OPTIONS https://api.mbz-hewad.com/api/login/ with Origin: https://mbz-hewad.com returns an OpenResty HTML browser-verification page, without CORS headers. Please remove interactive browser/JavaScript challenges for the Django JSON API at api.mbz-hewad.com/api/* and forward OPTIONS and application requests to the WSGI application. Keep ordinary WAF and rate-limit protection. The API already handles its CORS allowlist in Django.

## Django environment

Set these values in the backend application environment/root `.env`, not `frontend/.env`:

```dotenv
DEBUG=False
ALLOWED_HOSTS=api.mbz-hewad.com
SITE_ADDRESS=https://mbz-hewad.com
CORS_ALLOW_ALL_ORIGINS=False
CORS_ALLOWED_ORIGINS=https://mbz-hewad.com,https://www.mbz-hewad.com
CSRF_TRUSTED_ORIGINS=https://mbz-hewad.com,https://www.mbz-hewad.com
```

CSRF trusted origins describe the frontend sending requests. An API-only CSRF list does not trust the frontend. This is separate from the observed missing CORS headers on OPTIONS. Backend process environment variables can override `.env` values. Restart the hosting Python/WSGI application after updating configuration.

For an HTTPS-only site, use secure session/CSRF cookies. Only enable Django's HTTPS redirect once the hosting proxy forwards HTTPS reliably and Django is configured to trust that proxy's scheme header; otherwise a redirect loop can replace the real API response. This redirect configuration is not the cause of the observed verification page.

## Verification

```sh
curl -i -X OPTIONS 'https://api.mbz-hewad.com/api/login/' \
  -H 'Origin: https://mbz-hewad.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,authorization'
```

Expect HTTP 200, `Access-Control-Allow-Origin: https://mbz-hewad.com`, POST in allowed methods, and content-type/authorization in allowed headers. An HTML verification page means the edge issue remains. Do not solve only OPTIONS: actual JSON requests must reach Django too.

Local regression check (no database access required):

```sh
DEBUG=False venv/bin/python manage.py test api.tests.test_login_cors --settings=backend.test_settings --noinput
```

The application's secret key and database password supplied during troubleshooting should be replaced on the hosting server. Do not copy the exposed values into examples, commands or version control.
