from cryptography.fernet import Fernet

# The Master Key. This must be exactly 32 url-safe base64-encoded bytes.
SECRET_ENCRYPTION_KEY = b'zt_oQ9yF_k3M3s99o4e2R_sE9F-1X7NnZ_T7R2wP5Y8='

# Initialize the AES cipher suite
cipher_suite = Fernet(SECRET_ENCRYPTION_KEY)

def encrypt_note(plain_text: str) -> str:
    # Convert string to bytes, encrypt, and convert back to string for the DB
    plain_bytes = plain_text.encode('utf-8')
    encrypted_bytes = cipher_suite.encrypt(plain_bytes)
    return encrypted_bytes.decode('utf-8')

def decrypt_note(encrypted_text: str) -> str:
    # Convert string to bytes, decrypt, and convert back to string for the user
    encrypted_bytes = encrypted_text.encode('utf-8')
    decrypted_bytes = cipher_suite.decrypt(encrypted_bytes)
    return decrypted_bytes.decode('utf-8')