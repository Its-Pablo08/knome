namespace Knome.API.Interfaces;

public interface IMessageEncryptionService
{
    (byte[] CipherText, byte[] Nonce, byte[] AuthTag, int KeyVersion) Encrypt(string plainText);
    string Decrypt(byte[] cipherText, byte[] nonce, byte[] authTag, int keyVersion);
}
