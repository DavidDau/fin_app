import unittest
from uuid import uuid4

from app.security import (
    create_access_token,
    get_user_id_from_access_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)


class AuthSecurityTests(unittest.TestCase):
    def test_passwords_are_hashed_and_verified(self) -> None:
        password = "correct horse battery staple"
        hashed = hash_password(password)

        self.assertNotEqual(password, hashed)
        self.assertTrue(verify_password(password, hashed))
        self.assertFalse(verify_password("wrong password", hashed))

    def test_access_token_round_trip(self) -> None:
        user_id = uuid4()
        token = create_access_token(user_id)

        self.assertEqual(get_user_id_from_access_token(token), user_id)

    def test_refresh_token_hash_is_deterministic(self) -> None:
        token = "refresh-token-value"

        self.assertEqual(hash_refresh_token(token), hash_refresh_token(token))
        self.assertNotEqual(hash_refresh_token(token), hash_refresh_token("other-token"))


if __name__ == "__main__":
    unittest.main()
