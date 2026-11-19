"""Production-origin preflights must work without authenticating or using the DB."""
from django.test import SimpleTestCase, override_settings


@override_settings(
    ALLOWED_HOSTS=['api.mbz-hewad.com'],
    CORS_ALLOW_ALL_ORIGINS=False,
    CORS_ALLOWED_ORIGINS=['https://mbz-hewad.com', 'https://www.mbz-hewad.com'],
    SECURE_SSL_REDIRECT=False,
)
class LoginCorsTests(SimpleTestCase):
    def preflight(self, origin):
        return self.client.options(
            '/api/login/', secure=True, HTTP_HOST='api.mbz-hewad.com',
            HTTP_ORIGIN=origin, HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST',
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS='content-type,authorization',
        )

    def test_both_frontend_origins_can_preflight_login_without_authentication(self):
        for origin in ('https://mbz-hewad.com', 'https://www.mbz-hewad.com'):
            with self.subTest(origin=origin):
                response = self.preflight(origin)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response['Access-Control-Allow-Origin'], origin)
                self.assertIn('POST', response['Access-Control-Allow-Methods'])
                self.assertIn('content-type', response['Access-Control-Allow-Headers'])
                self.assertIn('authorization', response['Access-Control-Allow-Headers'])

    def test_untrusted_origin_is_not_allowed(self):
        response = self.preflight('https://untrusted.example')
        self.assertNotIn('Access-Control-Allow-Origin', response)
