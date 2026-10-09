using Knome.API.Constants;
using Knome.API.Hubs;
using Knome.API.Middleware;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.FileProviders;
using System.IO;

using Serilog;

namespace Knome.API.Extensions;

public static class ApplicationBuilderExtensions
{
    public static WebApplication UseInfrastructure(this WebApplication app)
    {
        // Global Exception Handling Middleware
        app.UseMiddleware<ExceptionHandlingMiddleware>();

        // Serilog HTTP Request Logging
        app.UseSerilogRequestLogging(options =>
        {
            options.MessageTemplate = "HTTP {RequestMethod} {RequestPath} responded {StatusCode} in {Elapsed:0.0000} ms";
        });

        // F-022: Security Headers Middleware
        app.UseMiddleware<SecurityHeadersMiddleware>();

        // Swagger/OpenAPI UI (Development Mode)
        if (app.Environment.IsDevelopment())
        {
            app.UseSwagger();
            app.UseSwaggerUI(c =>
            {
                c.SwaggerEndpoint("/swagger/v1/swagger.json", "Knome Enterprise API v1");
                c.RoutePrefix = "swagger"; // Expose UI at /swagger
            });
        }

        if (!app.Environment.IsDevelopment())
        {
            app.UseHttpsRedirection();
        }

        // Enable CORS
        app.UseCors(ApiConstants.CorsPolicyName);

        // Serve uploaded files (images, videos, audio, docs) from custom StorageSettings:BasePath if configured
        var customStoragePath = app.Configuration["StorageSettings:BasePath"];
        if (!string.IsNullOrWhiteSpace(customStoragePath))
        {
            if (!Directory.Exists(customStoragePath)) Directory.CreateDirectory(customStoragePath);
            app.UseStaticFiles(new StaticFileOptions
            {
                FileProvider = new PhysicalFileProvider(customStoragePath),
                RequestPath = string.Empty,
                ServeUnknownFileTypes = true,
                OnPrepareResponse = ctx =>
                {
                    ctx.Context.Response.Headers.Append("Access-Control-Allow-Origin", "*");
                    ctx.Context.Response.Headers.Append("Access-Control-Allow-Headers", "*");
                    ctx.Context.Response.Headers.Append("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                }
            });
        }

        // Serve archived uploads transparently as fallback
        var archiveStoragePath = app.Configuration["StorageSettings:ArchivePath"];
        if (!string.IsNullOrWhiteSpace(archiveStoragePath) && Directory.Exists(archiveStoragePath))
        {
            app.UseStaticFiles(new StaticFileOptions
            {
                FileProvider = new PhysicalFileProvider(archiveStoragePath),
                RequestPath = string.Empty,
                ServeUnknownFileTypes = true,
                OnPrepareResponse = ctx =>
                {
                    ctx.Context.Response.Headers.Append("Access-Control-Allow-Origin", "*");
                    ctx.Context.Response.Headers.Append("Access-Control-Allow-Headers", "*");
                    ctx.Context.Response.Headers.Append("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                }
            });
        }

        // Also serve fallback from wwwroot for default / legacy assets
        var wwwroot = app.Environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        if (!Directory.Exists(wwwroot)) Directory.CreateDirectory(wwwroot);
        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = new PhysicalFileProvider(wwwroot),
            RequestPath = string.Empty,
            ServeUnknownFileTypes = true, // allow .mp4, .mp3, .docx etc.
            OnPrepareResponse = ctx =>
            {
                ctx.Context.Response.Headers.Append("Access-Control-Allow-Origin", "*");
                ctx.Context.Response.Headers.Append("Access-Control-Allow-Headers", "*");
                ctx.Context.Response.Headers.Append("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
            }
        });

        // F-023: Rate Limiting
        app.UseRateLimiter();

        app.UseAuthentication();
        app.UseAuthorization();

        // Map Controllers
        app.MapControllers();

        // Map SignalR Hubs
        app.MapHub<NotificationHub>("/hubs/notifications");

        // Initialize Database Tables if missing (Wiki and UserMessages)
        try
        {
            using var scope = app.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<Knome.API.Data.KnomeDbContext>();
            Knome.API.Data.WikiDbInitializer.EnsureWikiTablesExistAsync(db).GetAwaiter().GetResult();
            Knome.API.Data.UserMessageDbInitializer.EnsureUserMessageTablesExistAsync(db).GetAwaiter().GetResult();
            Knome.API.Data.ClipDbInitializer.EnsureClipTablesExistAsync(db).GetAwaiter().GetResult();
            Knome.API.Data.SystemSettingDbInitializer.EnsureSystemSettingsTableExistsAsync(db).GetAwaiter().GetResult();
        }
        catch (System.Exception ex)
        {
            Serilog.Log.Error(ex, "Failed to initialize database tables during startup.");
        }

        return app;
    }
}
