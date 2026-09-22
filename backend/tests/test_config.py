import unittest

from app.config import Settings


class SettingsTests(unittest.TestCase):
    def test_render_postgres_url_uses_psycopg_driver(self) -> None:
        settings = Settings(database_url="postgresql://finapp:secret@db.example.com:5432/finapp")

        self.assertEqual(
            settings.database_url,
            "postgresql+psycopg://finapp:secret@db.example.com:5432/finapp",
        )

    def test_existing_psycopg_url_is_unchanged(self) -> None:
        url = "postgresql+psycopg://finapp:secret@db.example.com:5432/finapp"

        self.assertEqual(Settings(database_url=url).database_url, url)


if __name__ == "__main__":
    unittest.main()
