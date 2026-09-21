import unittest

from fastapi.testclient import TestClient

from app.main import app


class SecurityHeaderTests(unittest.TestCase):
    def test_health_response_includes_security_headers(self) -> None:
        response = TestClient(app).get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        self.assertEqual(response.headers["x-frame-options"], "DENY")
        self.assertEqual(response.headers["referrer-policy"], "strict-origin-when-cross-origin")
        self.assertEqual(
            response.headers["permissions-policy"],
            "camera=(), microphone=(), geolocation=()",
        )


if __name__ == "__main__":
    unittest.main()
