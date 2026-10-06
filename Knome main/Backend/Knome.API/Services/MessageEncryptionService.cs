using System;
using System.Security.Cryptography;
using System.Text;
using Knome.API.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Knome.API.Services;

public class MessageEncryptionService : IMessageEncryptionService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<MessageEncryptionService> _logger;

    public MessageEncryptionService(IConfiguration configuration, ILogger<MessageEncryptionService> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    private byte[] GetKey(int keyVersion)
    {
        // 1. Prioritize environment variable (e.g. in production: KNOME_MESSAGE_KEY_V1)
        var envVar = Environment.GetEnvironmentVariable($"KNOME_MESSAGE_KEY_V{keyVersion}");
        if (!string.IsNullOrWhiteSpace(envVar))
        {
            return Convert.FromBase64String(envVar.Trim());
        }

        // 2. Read from configuration section MessageEncryption:Keys:{version}
        var configKey = _configuration[$"MessageEncryption:Keys:{keyVersion}"];
        if (!string.IsNullOrWhiteSpace(configKey))
        {
            return Convert.FromBase64String(configKey.Trim());
        }

        // 3. Fallback to default key if version is 1
        var defaultKey = _configuration["MessageEncryption:DefaultKey"];
        if (!string.IsNullOrWhiteSpace(defaultKey))
        {
            return Convert.FromBase64String(defaultKey.Trim());
        }

        _logger.LogError("Message encryption key for version {KeyVersion} could not be resolved from configuration or environment.", keyVersion);
        throw new InvalidOperationException($"Cryptographic key for version {keyVersion} is not configured.");
    }

    public (byte[] CipherText, byte[] Nonce, byte[] AuthTag, int KeyVersion) Encrypt(string plainText)
    {
        if (plainText == null) plainText = string.Empty;

        var keyVersion = 1;
        if (int.TryParse(_configuration["MessageEncryption:DefaultKeyVersion"], out var v) && v > 0)
        {
            keyVersion = v;
        }

        var key = GetKey(keyVersion);
        var plainBytes = Encoding.UTF8.GetBytes(plainText);
        var cipherBytes = new byte[plainBytes.Length];

        // 12-byte initialization vector (nonce) for AES-GCM
        var nonce = new byte[AesGcm.NonceByteSizes.MaxSize];
        RandomNumberGenerator.Fill(nonce);

        // 16-byte authentication tag for AES-GCM
        var tag = new byte[AesGcm.TagByteSizes.MaxSize];

        using (var aes = new AesGcm(key, tag.Length))
        {
            aes.Encrypt(nonce, plainBytes, cipherBytes, tag);
        }

        return (cipherBytes, nonce, tag, keyVersion);
    }

    public string Decrypt(byte[] cipherText, byte[] nonce, byte[] authTag, int keyVersion)
    {
        if (cipherText == null || cipherText.Length == 0)
        {
            return string.Empty;
        }

        if (nonce == null || nonce.Length == 0 || authTag == null || authTag.Length == 0)
        {
            throw new ArgumentException("Nonce and AuthTag must be provided for AES-GCM decryption.");
        }

        var key = GetKey(keyVersion);
        var plainBytes = new byte[cipherText.Length];

        using (var aes = new AesGcm(key, authTag.Length))
        {
            aes.Decrypt(nonce, cipherText, authTag, plainBytes);
        }

        return Encoding.UTF8.GetString(plainBytes);
    }
}
