namespace Knome.API.Configurations;

public class SmtpSettings
{
    private string _host = string.Empty;
    public string Host 
    { 
        get => _host; 
        set => _host = value; 
    }
    public string SmtpHost 
    { 
        get => _host; 
        set => _host = value; 
    }

    private int _port = 25;
    public int Port 
    { 
        get => _port; 
        set => _port = value; 
    }
    public int SmtpPort 
    { 
        get => _port; 
        set => _port = value; 
    }

    private string _senderName = "knome";
    public string SenderName 
    { 
        get => _senderName; 
        set => _senderName = value; 
    }
    public string FromDisplayName 
    { 
        get => _senderName; 
        set => _senderName = value; 
    }

    private string _senderEmail = string.Empty;
    public string SenderEmail 
    { 
        get => _senderEmail; 
        set => _senderEmail = value; 
    }
    public string From 
    { 
        get => _senderEmail; 
        set => _senderEmail = value; 
    }

    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;

    public string Encryption { get; set; } = "None";
    public bool EnableSsl { get; set; } = false;
    public bool AuthRequired { get; set; } = false;
}
