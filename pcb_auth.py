"""Password hashing for the grant tracker — PBKDF2-HMAC-SHA256, salted.

Demo-grade but real: per-user random 16-byte salt, 200,000 iterations,
constant-time verification. In production the pepper/secrets move to Azure
Key Vault and iterations/algo migrate via the columns stored per user.
"""
import hashlib
import hmac
import os

ALGO = "pbkdf2_sha256"
ITERATIONS = 200_000


def hash_password(password, salt=None, iterations=ITERATIONS):
    """Return (salt_hex, hash_hex, algo, iterations)."""
    if salt is None:
        salt = os.urandom(16)
    elif isinstance(salt, str):
        salt = bytes.fromhex(salt)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return salt.hex(), digest.hex(), ALGO, iterations


def verify_password(password, salt_hex, hash_hex, iterations):
    _, candidate, _, _ = hash_password(password, salt_hex, iterations)
    return hmac.compare_digest(candidate, hash_hex)
