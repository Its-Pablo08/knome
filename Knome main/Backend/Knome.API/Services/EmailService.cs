using System.Text.Encodings.Web;
using Knome.API.Configurations;
using Knome.API.Interfaces;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace Knome.API.Services;

public class EmailService : IEmailService
{
    private readonly SmtpSettings _settings;
    private readonly ILogger<EmailService> _logger;
    private readonly ISystemSettingService? _settingService;

    public EmailService(IOptions<SmtpSettings> settings, ILogger<EmailService> logger, ISystemSettingService? settingService = null)
    {
        _settings = settings.Value;
        _logger = logger;
        _settingService = settingService;
    }

    public Task<bool> SendEmailAsync(string toEmail, string subject, string htmlBody)
    {
        return SendEmailAsync(toEmail, subject, htmlBody, null);
    }

    public async Task<bool> SendEmailAsync(string toEmail, string subject, string htmlBody, string? textBody)
    {
        if (_settingService != null && !await _settingService.GetEnableEmailAsync())
        {
            _logger.LogInformation("SendEmailAsync suppressed: Outgoing email notifications are disabled by system administrator.");
            return false;
        }

        if (string.IsNullOrWhiteSpace(toEmail))
        {
            _logger.LogWarning("SendEmailAsync aborted: recipient email is empty.");
            return false;
        }

        try
        {
            var message = new MimeMessage();
            var fromEmail = !string.IsNullOrWhiteSpace(_settings.SenderEmail) ? _settings.SenderEmail : _settings.Username;
            
            message.From.Add(new MailboxAddress(_settings.SenderName, fromEmail));
            message.ReplyTo.Add(new MailboxAddress(_settings.SenderName, fromEmail));
            message.To.Add(MailboxAddress.Parse(toEmail.Trim()));
            message.Subject = subject;
            message.Date = DateTimeOffset.UtcNow;
            message.MessageId = MimeKit.Utils.MimeUtils.GenerateMessageId("gmail.com");

            // Anti-Spam Compliance Headers
            message.Headers.Add("X-Mailer", "Knome-Enterprise-Mailer-v1");
            message.Headers.Add("Auto-Submitted", "auto-generated");

            var bodyBuilder = new BodyBuilder
            {
                HtmlBody = htmlBody,
                TextBody = !string.IsNullOrWhiteSpace(textBody) 
                    ? textBody 
                    : System.Text.RegularExpressions.Regex.Replace(htmlBody, "<.*?>", string.Empty)
            };

            message.Body = bodyBuilder.ToMessageBody();

            using var client = new SmtpClient();
            var secureOption = _settings.EnableSsl 
                ? (_settings.Port == 465 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.Auto) 
                : SecureSocketOptions.None;
            
            await client.ConnectAsync(_settings.Host, _settings.Port, secureOption);
            if (!string.IsNullOrEmpty(_settings.Username) && !string.IsNullOrEmpty(_settings.Password))
            {
                await client.AuthenticateAsync(_settings.Username, _settings.Password);
            }

            await client.SendAsync(message);
            await client.DisconnectAsync(true);

            _logger.LogInformation("Email sent successfully to {ToEmail} with Subject: {Subject}", toEmail, subject);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email to {ToEmail} with Subject: {Subject}", toEmail, subject);
            // Non-blocking: email failure will not crash calling services
            return false;
        }
    }

    public async Task<bool> SendRolePendingEmailAsync(string toEmail, string fullName, string employeeId, string departmentName, string designation)
    {
        var safeName = HtmlEncoder.Default.Encode(fullName ?? "Team Member");
        var safeEmpId = HtmlEncoder.Default.Encode(employeeId ?? "");
        var safeDept = HtmlEncoder.Default.Encode(departmentName ?? "General");
        var safeDesig = HtmlEncoder.Default.Encode(designation ?? "Employee");

        var plainText = $@"Welcome to Knome, {fullName}!

Your account has been successfully initialized via EmployeeHub Single Sign-On (SSO).
Default 'Employee' role access has been activated for your profile. You can now log in, explore feeds, join communities, and collaborate.

Your profile has also been notified to the System Administrator for role assignment / review.

Employee ID: {employeeId}
Department: {departmentName}
Designation: {designation}
Current Access: Employee (Default Active)

You can access the Knome portal at any time. When an administrator assigns or updates your role, you will receive an automatic update.

Regards,
MPOnline Limited - Knome Team";

        var html = $@"
<!DOCTYPE html>
<html lang=""en"">
<head>
    <meta charset=""UTF-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <title>Welcome to Knome</title>
</head>
<body style=""margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;"">
    <table role=""presentation"" width=""100%"" cellspacing=""0"" cellpadding=""0"" style=""background-color: #f1f5f9; padding: 40px 15px;"">
        <tr>
            <td align=""center"">
                <!-- Main Container Card -->
                <table role=""presentation"" width=""100%"" style=""max-width: 600px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06); border: 1px solid #e2e8f0;"" cellspacing=""0"" cellpadding=""0"">
                    
                    <!-- Header Banner (Vibrant Indigo Gradient) -->
                    <tr>
                        <td style=""background: linear-gradient(135deg, #312e81 0%, #4f46e5 50%, #6366f1 100%); padding: 36px 32px; text-align: center;"">
                            <div style=""display: inline-block; background-color: rgba(255, 255, 255, 0.15); padding: 6px 16px; border-radius: 9999px; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #ffffff; margin-bottom: 12px; border: 1px solid rgba(255, 255, 255, 0.2);"">
                                MPOnline Limited • Enterprise Knowledge Portal
                            </div>
                            <h1 style=""margin: 0; color: #ffffff; font-size: 28px; font-weight: 900; letter-spacing: -0.5px;"">
                                Welcome to Knome! 🎉
                            </h1>
                            <p style=""margin: 6px 0 0 0; color: #e0e7ff; font-size: 13px; font-weight: 500;"">
                                Knowledge Management & Employee Engagement Platform
                            </p>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td style=""padding: 36px 32px;"">
                            <h2 style=""margin: 0 0 12px 0; font-size: 20px; font-weight: 800; color: #0f172a;"">
                                Hello {safeName},
                            </h2>
                            <p style=""margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;"">
                                Your account has been initialized via <strong>EmployeeHub Single Sign-On (SSO)</strong>. You have been assigned the default <strong>Employee</strong> role so you can start using Knome right away!
                            </p>

                            <!-- Access Badge Box -->
                            <div style=""background-color: #ecfdf5; border: 1px solid #d1fae5; border-left: 4px solid #10b981; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;"">
                                <div style=""display: flex; align-items: center; margin-bottom: 6px;"">
                                    <span style=""font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #065f46;"">
                                        Active Role: Employee (Default)
                                    </span>
                                </div>
                                <p style=""margin: 0; font-size: 13px; color: #047857; line-height: 1.5;"">
                                    You can explore the enterprise feed, publish posts, read articles, stream videos, listen to podcasts, and earn Karma points.
                                </p>
                            </div>

                            <!-- Details Table -->
                            <table role=""presentation"" width=""100%"" style=""background-color: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 24px;"">
                                <tr>
                                    <td style=""padding: 8px 12px; font-size: 12px; font-weight: 700; color: #64748b; width: 40%;"">Employee ID</td>
                                    <td style=""padding: 8px 12px; font-size: 13px; font-weight: 700; color: #0f172a;"">{safeEmpId}</td>
                                </tr>
                                <tr>
                                    <td style=""padding: 8px 12px; font-size: 12px; font-weight: 700; color: #64748b; border-top: 1px solid #e2e8f0;"">Department</td>
                                    <td style=""padding: 8px 12px; font-size: 13px; font-weight: 600; color: #0f172a; border-top: 1px solid #e2e8f0;"">{safeDept}</td>
                                </tr>
                                <tr>
                                    <td style=""padding: 8px 12px; font-size: 12px; font-weight: 700; color: #64748b; border-top: 1px solid #e2e8f0;"">Designation</td>
                                    <td style=""padding: 8px 12px; font-size: 13px; font-weight: 600; color: #0f172a; border-top: 1px solid #e2e8f0;"">{safeDesig}</td>
                                </tr>
                                <tr>
                                    <td style=""padding: 8px 12px; font-size: 12px; font-weight: 700; color: #64748b; border-top: 1px solid #e2e8f0;"">Admin Status</td>
                                    <td style=""padding: 8px 12px; font-size: 13px; font-weight: 600; color: #6366f1; border-top: 1px solid #e2e8f0;"">Notified for Role Review</td>
                                </tr>
                            </table>

                            <p style=""margin: 0 0 20px 0; font-size: 13px; line-height: 1.6; color: #64748b;"">
                                Your profile has also been queued for the <strong>System Administrator</strong>. If an elevated role (e.g. Community Admin or HR Admin) is assigned to you, you will receive an automatic email notification.
                            </p>

                            <!-- Security Notice -->
                            <div style=""border-top: 1px solid #f1f5f9; padding-top: 20px; font-size: 12px; color: #94a3b8; line-height: 1.5;"">
                                If you did not log into Knome, please immediately contact your IT Security & Governance team.
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style=""background-color: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0;"">
                            <p style=""margin: 0 0 6px 0; font-size: 12px; font-weight: 700; color: #64748b;"">
                                © 2026 MPOnline Limited. All rights reserved.
                            </p>
                            <p style=""margin: 0; font-size: 11px; color: #94a3b8;"">
                                Knome Enterprise Knowledge & Collaboration Network • Internal Confidential
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>";

        return await SendEmailAsync(toEmail, $"🎉 Welcome to Knome, {safeName}! Your Account is Ready ({safeEmpId})", html, plainText);
    }

    public async Task<bool> SendRoleAssignedEmailAsync(string toEmail, string fullName, string employeeId, string roleName, string departmentName, string? adminComment = null)
    {
        var safeName = HtmlEncoder.Default.Encode(fullName ?? "Team Member");
        var safeEmpId = HtmlEncoder.Default.Encode(employeeId ?? "");
        var safeRole = HtmlEncoder.Default.Encode(roleName ?? "Employee");
        var safeDept = HtmlEncoder.Default.Encode(departmentName ?? "General");
        var safeComment = !string.IsNullOrWhiteSpace(adminComment) ? HtmlEncoder.Default.Encode(adminComment) : null;

        var plainText = $@"Congratulations, {fullName}!

Your role has been updated by the System Administrator.
Your assigned role is now: {roleName}.

Employee ID: {employeeId}
Department: {departmentName}
Assigned Role: {roleName}
Assigned By: System Administrator
{(adminComment != null ? $"Admin Note: {adminComment}\n" : "")}

You can now log into Knome to access all features associated with your new role.

Regards,
MPOnline Limited - Knome Team";

        var html = $@"
<!DOCTYPE html>
<html lang=""en"">
<head>
    <meta charset=""UTF-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <title>Role Updated - Knome</title>
</head>
<body style=""margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;"">
    <table role=""presentation"" width=""100%"" cellspacing=""0"" cellpadding=""0"" style=""background-color: #f1f5f9; padding: 40px 15px;"">
        <tr>
            <td align=""center"">
                <!-- Main Container Card -->
                <table role=""presentation"" width=""100%"" style=""max-width: 600px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06); border: 1px solid #e2e8f0;"" cellspacing=""0"" cellpadding=""0"">
                    
                    <!-- Header Banner (Emerald Success Gradient) -->
                    <tr>
                        <td style=""background: linear-gradient(135deg, #059669 0%, #0284c7 100%); padding: 36px 32px; text-align: center;"">
                            <div style=""display: inline-block; background-color: rgba(255, 255, 255, 0.18); padding: 6px 16px; border-radius: 9999px; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #ffffff; margin-bottom: 12px; border: 1px solid rgba(255, 255, 255, 0.2);"">
                                Access Role Updated
                            </div>
                            <h1 style=""margin: 0; color: #ffffff; font-size: 26px; font-weight: 900; letter-spacing: -0.5px;"">
                                KNOME
                            </h1>
                            <p style=""margin: 6px 0 0 0; color: #e0f2fe; font-size: 13px; font-weight: 500;"">
                                Knowledge Management & Excellence Platform
                            </p>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td style=""padding: 36px 32px;"">
                            <h2 style=""margin: 0 0 12px 0; font-size: 20px; font-weight: 800; color: #0f172a;"">
                                Congratulations, {safeName}!
                            </h2>
                            <p style=""margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #475569;"">
                                <strong>Your access role has been updated by the System Administrator.</strong> Your assigned role is now <strong>{safeRole}</strong>. You now have full access with your updated permissions on the Knome platform.
                            </p>

                            <!-- Role Highlight Card -->
                            <div style=""background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border: 1px solid #bbf7d0; border-left: 5px solid #10b981; border-radius: 14px; padding: 20px; margin-bottom: 24px; text-align: center;"">
                                <span style=""font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #047857;"">
                                    Current Active Role
                                </span>
                                <h3 style=""margin: 6px 0 0 0; font-size: 24px; font-weight: 900; color: #065f46;"">
                                    {safeRole}
                                </h3>
                            </div>

                            <!-- Assignment Details -->
                            <table role=""presentation"" width=""100%"" style=""background-color: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 28px;"">
                                <tr>
                                    <td style=""padding: 8px 12px; font-size: 12px; font-weight: 700; color: #64748b; width: 40%;"">Employee ID</td>
                                    <td style=""padding: 8px 12px; font-size: 13px; font-weight: 700; color: #0f172a;"">{safeEmpId}</td>
                                </tr>
                                <tr>
                                    <td style=""padding: 8px 12px; font-size: 12px; font-weight: 700; color: #64748b; border-top: 1px solid #e2e8f0;"">Department</td>
                                    <td style=""padding: 8px 12px; font-size: 13px; font-weight: 600; color: #0f172a; border-top: 1px solid #e2e8f0;"">{safeDept}</td>
                                </tr>
                                <tr>
                                    <td style=""padding: 8px 12px; font-size: 12px; font-weight: 700; color: #64748b; border-top: 1px solid #e2e8f0;"">Approved / Assigned By</td>
                                    <td style=""padding: 8px 12px; font-size: 13px; font-weight: 600; color: #0f172a; border-top: 1px solid #e2e8f0;"">System Administrator</td>
                                </tr>
                                {(safeComment != null ? $@"
                                <tr>
                                    <td style=""padding: 8px 12px; font-size: 12px; font-weight: 700; color: #64748b; border-top: 1px solid #e2e8f0;"">Admin Note</td>
                                    <td style=""padding: 8px 12px; font-size: 13px; font-style: italic; color: #334155; border-top: 1px solid #e2e8f0;"">{safeComment}</td>
                                </tr>" : "")}
                            </table>

                            <div style=""text-align: center; margin-bottom: 24px;"">
                                <div style=""display: inline-block; background: linear-gradient(135deg, #059669 0%, #0284c7 100%); color: #ffffff; font-size: 14px; font-weight: 800; padding: 12px 28px; border-radius: 12px; box-shadow: 0 4px 14px rgba(5, 150, 105, 0.25); letter-spacing: 0.3px;"">
                                    Permissions Updated
                                </div>
                            </div>

                            <p style=""margin: 0; font-size: 13px; line-height: 1.6; color: #64748b; text-align: center;"">
                                You can now access features associated with your updated role on the Knome portal.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style=""background-color: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0;"">
                            <p style=""margin: 0 0 6px 0; font-size: 12px; font-weight: 700; color: #64748b;"">
                                © 2026 MPOnline Limited. All rights reserved.
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>";

        return await SendEmailAsync(toEmail, $"[Knome Portal] Role Updated by System Administrator: {safeRole}", html, plainText);
    }

    public async Task SendTemplateEmailAsync(string toEmail, string templateName, object model)
    {
        string htmlBody = $"<h2>Knome Notification</h2><p>{templateName}</p>";
        await SendEmailAsync(toEmail, "Knome Enterprise Alert", htmlBody);
    }
}
