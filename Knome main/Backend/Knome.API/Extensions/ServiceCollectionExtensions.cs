using System.Linq;
using System.Text;
using System.Threading.RateLimiting;
using FluentValidation;
using Knome.API.Configuration;
using Knome.API.Configurations;
using Knome.API.Constants;
using Knome.API.Converters;
using Knome.API.Data;
using Knome.API.Filters;
using Knome.API.Interfaces;
using Knome.API.Repositories;
using Knome.API.Responses;
using Knome.API.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

namespace Knome.API.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddMemoryCache();
        AddCorsPolicy(services, configuration);
        AddDatabase(services, configuration);
        AddAuthentication(services, configuration);
        AddAuthorization(services);
        AddRateLimiting(services);
        AddApplicationServices(services, configuration);
        AddSwagger(services);
        services.AddSignalR();

        return services;
    }

    // ------------------------------------------------------------------ //

    private static void AddCorsPolicy(IServiceCollection services, IConfiguration configuration)
    {
        var corsSection = configuration.GetSection("CorsSettings");
        services.Configure<CorsSettings>(corsSection);
        var corsSettings = corsSection.Get<CorsSettings>() ?? new CorsSettings();

        services.AddCors(options =>
        {
            options.AddPolicy(ApiConstants.CorsPolicyName, builder =>
            {
                builder.SetIsOriginAllowed(origin => true)
                       .AllowAnyMethod()
                       .AllowAnyHeader()
                       .AllowCredentials();
            });
        });
    }

    private static void AddDatabase(IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection");
        services.AddDbContext<KnomeDbContext>(options =>
            options.UseSqlServer(connectionString, sqlOptions =>
            {
                sqlOptions.EnableRetryOnFailure(
                    maxRetryCount: 5,
                    maxRetryDelay: TimeSpan.FromSeconds(30),
                    errorNumbersToAdd: null);
                sqlOptions.CommandTimeout(60);
            }));
        services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
    }

    private static void AddAuthentication(IServiceCollection services, IConfiguration configuration)
    {
        var jwtSection = configuration.GetSection("JwtSettings");
        var jwtSettings = jwtSection.Get<JwtSettings>() ?? new JwtSettings();

        // F-018: Prioritize environment variable / user secrets override for JWT SecretKey
        var secretKeyOverride = configuration["JWT_SECRET_KEY"] ?? configuration["JwtSettings:SecretKey"];
        if (!string.IsNullOrEmpty(secretKeyOverride))
        {
            jwtSettings.SecretKey = secretKeyOverride;
        }

        services.Configure<JwtSettings>(options =>
        {
            options.SecretKey = jwtSettings.SecretKey;
            options.Issuer = jwtSettings.Issuer;
            options.Audience = jwtSettings.Audience;
            options.ExpiryMinutes = jwtSettings.ExpiryMinutes;
        });

        // MPO Employee Hub SSO Auth Server Settings
        var mpoSection = configuration.GetSection("MPOAuthServer");
        var mpoSettings = mpoSection.Get<MPOAuthServerSettings>() ?? new MPOAuthServerSettings();
        services.Configure<MPOAuthServerSettings>(mpoSection);

        var key = Encoding.UTF8.GetBytes(jwtSettings.SecretKey);
        var mpoAuthority = mpoSettings.Authority ?? "https://counselling-1.mponline.demo.gov.in:3001";

        // Named HttpClient for MPO OIDC Token Proxying
        services.AddHttpClient("MpoOidc", client =>
        {
            client.BaseAddress = new Uri(mpoAuthority);
            client.Timeout = TimeSpan.FromSeconds(30);
        })
        .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
        });

        // Named HttpClient for EmployeeHub REST API (profile sync)
        var ehApiSection = configuration.GetSection("EmployeeHubApi");
        services.Configure<EmployeeHubApiSettings>(ehApiSection);
        var ehApiSettings = ehApiSection.Get<EmployeeHubApiSettings>() ?? new EmployeeHubApiSettings();
        var ehBaseUrl = ehApiSettings.BaseUrl ?? mpoAuthority;
        services.AddHttpClient("EmployeeHubApi", client =>
        {
            client.BaseAddress = new Uri(ehBaseUrl.TrimEnd('/') + '/');
            client.Timeout = TimeSpan.FromSeconds(ehApiSettings.TimeoutSeconds > 0 ? ehApiSettings.TimeoutSeconds : 10);
            client.DefaultRequestHeaders.Add("Accept", "application/json");
            if (!string.IsNullOrEmpty(ehApiSettings.ApiKey))
                client.DefaultRequestHeaders.Add("X-Api-Key", ehApiSettings.ApiKey);
        })
        .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
        });

        services.AddAuthentication(options =>
        {
            options.DefaultAuthenticateScheme = "DynamicJwt";
            options.DefaultChallengeScheme = "DynamicJwt";
        })
        .AddPolicyScheme("DynamicJwt", "DynamicJwt", options =>
        {
            options.ForwardDefaultSelector = context =>
            {
                var authHeader = context.Request.Headers.Authorization.ToString();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                {
                    var tokenQuery = context.Request.Query["access_token"].ToString();
                    if (!string.IsNullOrEmpty(tokenQuery))
                    {
                        if (tokenQuery.StartsWith("eyJhbGciOiJSUz", StringComparison.OrdinalIgnoreCase))
                            return "MPO";
                        return JwtBearerDefaults.AuthenticationScheme;
                    }
                    return "MPO";
                }

                var token = authHeader.Substring("Bearer ".Length).Trim();
                if (token.StartsWith("eyJhbGciOiJSUz", StringComparison.OrdinalIgnoreCase))
                {
                    return "MPO";
                }

                return JwtBearerDefaults.AuthenticationScheme;
            };
        })
        .AddJwtBearer("MPO", options =>
        {
            // MPO OIDC discovery will fetch public keys from Authority
            options.Authority = mpoAuthority;
            options.RequireHttpsMetadata = false;

            options.BackchannelHttpHandler = new HttpClientHandler
            {
                ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
            };

            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuers = new[]
                {
                    mpoAuthority,
                    mpoAuthority.TrimEnd('/') + "/",
                    mpoAuthority.TrimEnd('/'),
                    "https://counselling-1.mponline.demo.gov.in:3001",
                    "https://counselling-1.mponline.demo.gov.in:3001/",
                    "https://counselling-1.mponline.demo.gov.in",
                    "https://counselling-1.mponline.demo.gov.in/",
                    "http://api:8080",
                    "http://api:8080/",
                    jwtSettings.Issuer,
                    "EmployeeHub.Identity",
                    "Knome.API"
                },
                ValidateAudience = false,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = false,
                SignatureValidator = (token, parameters) => new Microsoft.IdentityModel.JsonWebTokens.JsonWebToken(token),
                ClockSkew = TimeSpan.Zero,
                NameClaimType = "sub",
                RoleClaimType = "role"
            };

            options.Events = new JwtBearerEvents
            {
                OnAuthenticationFailed = context =>
                {
                    Serilog.Log.Warning(context.Exception, "[MPO] Token authentication failed: {Message}", context.Exception.Message);
                    return Task.CompletedTask;
                },
                OnMessageReceived = context =>
                {
                    var accessToken = context.Request.Query["access_token"];
                    var path = context.HttpContext.Request.Path;
                    if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                        context.Token = accessToken;
                    return Task.CompletedTask;
                },
                OnTokenValidated = async context =>
                {
                    var email = context.Principal?.FindFirst("email")?.Value
                             ?? context.Principal?.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value
                             ?? context.Principal?.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value
                             ?? context.Principal?.FindFirst("name")?.Value;

                    var sub = context.Principal?.FindFirst("sub")?.Value
                           ?? context.Principal?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;

                    var empId = context.Principal?.FindFirst("employeeId")?.Value
                             ?? context.Principal?.FindFirst("employee_id")?.Value
                             ?? context.Principal?.FindFirst("empId")?.Value;

                    if (context.Principal?.Identity is System.Security.Claims.ClaimsIdentity identity)
                    {
                        var dbContext = context.HttpContext.RequestServices.GetRequiredService<KnomeDbContext>();

                        var user = await dbContext.Users
                            .Include(u => u.Roles)
                            .AsNoTracking()
                            .FirstOrDefaultAsync(u =>
                                (!string.IsNullOrEmpty(email) && u.Email.ToLower() == email.ToLower()) ||
                                (!string.IsNullOrEmpty(empId) && u.EmployeeId.ToLower() == empId.ToLower()) ||
                                (!string.IsNullOrEmpty(sub) && (u.EmployeeId.ToLower() == sub.ToLower() || (u.Email != null && u.Email.ToLower() == sub.ToLower()))));

                        if (user == null && (!string.IsNullOrEmpty(email) || !string.IsNullOrEmpty(empId) || !string.IsNullOrEmpty(sub)))
                        {
                            try
                            {
                                var authService = context.HttpContext.RequestServices.GetRequiredService<IAuthService>();
                                var searchId = !string.IsNullOrEmpty(email) ? email : (!string.IsNullOrEmpty(empId) ? empId : sub!);
                                var currentUserDto = await authService.GetCurrentUserByIdentifierAsync(searchId);
                                if (currentUserDto != null)
                                {
                                    user = await dbContext.Users
                                        .Include(u => u.Roles)
                                        .AsNoTracking()
                                        .FirstOrDefaultAsync(u => u.UserId == currentUserDto.UserId);
                                }
                            }
                            catch
                            {
                                // fallback gracefully
                            }
                        }

                        if (user != null)
                        {
                            if (!identity.HasClaim(c => c.Type == "uid"))
                                identity.AddClaim(new System.Security.Claims.Claim("uid", user.UserId.ToString()));
                            if (!identity.HasClaim(c => c.Type == "employeeId"))
                                identity.AddClaim(new System.Security.Claims.Claim("employeeId", user.EmployeeId));
                            if (!identity.HasClaim(c => c.Type == "username"))
                                identity.AddClaim(new System.Security.Claims.Claim("username", user.EmployeeId));
                            if (!identity.HasClaim(c => c.Type == System.Security.Claims.ClaimTypes.NameIdentifier))
                                identity.AddClaim(new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier, user.UserId.ToString()));

                            var hasRole = false;
                            foreach (var role in user.Roles)
                            {
                                hasRole = true;
                                if (!identity.HasClaim(c => c.Type == System.Security.Claims.ClaimTypes.Role && c.Value == role.RoleName))
                                    identity.AddClaim(new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Role, role.RoleName));
                                if (!identity.HasClaim(c => c.Type == "role" && c.Value == role.RoleName))
                                    identity.AddClaim(new System.Security.Claims.Claim("role", role.RoleName));
                            }

                            if (!hasRole)
                            {
                                if (!identity.HasClaim(c => c.Type == System.Security.Claims.ClaimTypes.Role && c.Value == "Employee"))
                                    identity.AddClaim(new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Role, "Employee"));
                                if (!identity.HasClaim(c => c.Type == "role" && c.Value == "Employee"))
                                    identity.AddClaim(new System.Security.Claims.Claim("role", "Employee"));
                            }
                        }
                        else
                        {
                            // Default fallback claims for brand new identity
                            var fallbackId = !string.IsNullOrEmpty(email) ? email.Split('@')[0] : (!string.IsNullOrEmpty(empId) ? empId : (sub ?? "EMP"));
                            if (!identity.HasClaim(c => c.Type == "employeeId"))
                                identity.AddClaim(new System.Security.Claims.Claim("employeeId", fallbackId));
                            if (!identity.HasClaim(c => c.Type == System.Security.Claims.ClaimTypes.Role && c.Value == "Employee"))
                                identity.AddClaim(new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Role, "Employee"));
                            if (!identity.HasClaim(c => c.Type == "role" && c.Value == "Employee"))
                                identity.AddClaim(new System.Security.Claims.Claim("role", "Employee"));
                        }
                    }
                }
            };
        })
        .AddJwtBearer(JwtBearerDefaults.AuthenticationScheme, options =>
        {
            // Symmetric Knome and MPO Hub tokens
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = false,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuers = new[]
                {
                    mpoAuthority,
                    mpoAuthority.TrimEnd('/') + "/",
                    mpoAuthority.TrimEnd('/'),
                    "https://counselling-1.mponline.demo.gov.in:3001",
                    "https://counselling-1.mponline.demo.gov.in:3001/",
                    "https://counselling-1.mponline.demo.gov.in",
                    "https://counselling-1.mponline.demo.gov.in/",
                    jwtSettings.Issuer,
                    "EmployeeHub.Identity",
                    "Knome.API"
                },
                IssuerSigningKey = new SymmetricSecurityKey(key),
                ClockSkew = TimeSpan.Zero,
                NameClaimType = "sub",
                RoleClaimType = "role"
            };
            options.Events = new JwtBearerEvents
            {
                OnMessageReceived = context =>
                {
                    var accessToken = context.Request.Query["access_token"];
                    var path = context.HttpContext.Request.Path;
                    if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                        context.Token = accessToken;
                    return Task.CompletedTask;
                },
                OnTokenValidated = async context =>
                {
                    var email = context.Principal?.FindFirst("email")?.Value
                             ?? context.Principal?.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value
                             ?? context.Principal?.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value
                             ?? context.Principal?.FindFirst("name")?.Value;

                    var sub = context.Principal?.FindFirst("sub")?.Value
                           ?? context.Principal?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;

                    var empId = context.Principal?.FindFirst("employeeId")?.Value
                             ?? context.Principal?.FindFirst("employee_id")?.Value
                             ?? context.Principal?.FindFirst("empId")?.Value;

                    if (context.Principal?.Identity is System.Security.Claims.ClaimsIdentity identity)
                    {
                        var dbContext = context.HttpContext.RequestServices.GetRequiredService<KnomeDbContext>();

                        var user = await dbContext.Users
                            .Include(u => u.Roles)
                            .AsNoTracking()
                            .FirstOrDefaultAsync(u =>
                                (!string.IsNullOrEmpty(email) && u.Email.ToLower() == email.ToLower()) ||
                                (!string.IsNullOrEmpty(empId) && u.EmployeeId.ToLower() == empId.ToLower()) ||
                                (!string.IsNullOrEmpty(sub) && (u.EmployeeId.ToLower() == sub.ToLower() || (u.Email != null && u.Email.ToLower() == sub.ToLower()))));

                        if (user != null)
                        {
                            if (!identity.HasClaim(c => c.Type == "uid"))
                                identity.AddClaim(new System.Security.Claims.Claim("uid", user.UserId.ToString()));
                            if (!identity.HasClaim(c => c.Type == "employeeId"))
                                identity.AddClaim(new System.Security.Claims.Claim("employeeId", user.EmployeeId));
                            if (!identity.HasClaim(c => c.Type == "username"))
                                identity.AddClaim(new System.Security.Claims.Claim("username", user.EmployeeId));
                            if (!identity.HasClaim(c => c.Type == System.Security.Claims.ClaimTypes.NameIdentifier))
                                identity.AddClaim(new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier, user.UserId.ToString()));

                            var hasRole = false;
                            foreach (var role in user.Roles)
                            {
                                hasRole = true;
                                if (!identity.HasClaim(c => c.Type == System.Security.Claims.ClaimTypes.Role && c.Value == role.RoleName))
                                    identity.AddClaim(new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Role, role.RoleName));
                                if (!identity.HasClaim(c => c.Type == "role" && c.Value == role.RoleName))
                                    identity.AddClaim(new System.Security.Claims.Claim("role", role.RoleName));
                            }

                            if (!hasRole)
                            {
                                if (!identity.HasClaim(c => c.Type == System.Security.Claims.ClaimTypes.Role && c.Value == "Employee"))
                                    identity.AddClaim(new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Role, "Employee"));
                                if (!identity.HasClaim(c => c.Type == "role" && c.Value == "Employee"))
                                    identity.AddClaim(new System.Security.Claims.Claim("role", "Employee"));
                            }
                        }
                    }
                }
            };
        });
    }

    private static void AddAuthorization(IServiceCollection services)
    {
        services.AddAuthorization(options =>
        {
            options.DefaultPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder(
                    "DynamicJwt")
                .RequireAuthenticatedUser()
                .Build();

            options.AddPolicy(Roles.Employee,       p => p.AddAuthenticationSchemes("DynamicJwt").RequireRole(Roles.Employee));
            options.AddPolicy(Roles.CommunityAdmin, p => p.AddAuthenticationSchemes("DynamicJwt").RequireRole(Roles.CommunityAdmin));
            options.AddPolicy(Roles.HRAdmin,        p => p.AddAuthenticationSchemes("DynamicJwt").RequireRole(Roles.HRAdmin));
            options.AddPolicy(Roles.SystemAdmin,    p => p.AddAuthenticationSchemes("DynamicJwt").RequireRole(Roles.SystemAdmin));
        });
    }

    private static void AddRateLimiting(IServiceCollection services)
    {
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy("LoginRateLimiter", httpContext =>
                RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? httpContext.Request.Headers.Host.ToString(),
                    factory: _ => new FixedWindowRateLimiterOptions
                    {
                        AutoReplenishment = true,
                        PermitLimit = 30,
                        Window = System.TimeSpan.FromMinutes(1)
                    }));
        });
    }

    private static void AddApplicationServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddControllers(options =>
        {
            options.Filters.Add<ValidationFilter>();
        })
        .AddJsonOptions(options =>
        {
            options.JsonSerializerOptions.Converters.Add(new UtcDateTimeJsonConverter());
            options.JsonSerializerOptions.Converters.Add(new NullableUtcDateTimeJsonConverter());
        })
        .ConfigureApiBehaviorOptions(options =>
        {
            options.InvalidModelStateResponseFactory = context =>
            {
                var errors = context.ModelState
                    .Where(e => e.Value?.Errors.Count > 0)
                    .SelectMany(e => e.Value!.Errors.Select(x => x.ErrorMessage))
                    .ToList();

                var response = ApiResponse.FailureResponse(
                    StatusCodes.Status400BadRequest,
                    ApiConstants.Messages.ValidationError,
                    errors);

                return new BadRequestObjectResult(response);
            };
        });
        services.AddAutoMapper(typeof(Program).Assembly);
        services.AddValidatorsFromAssembly(typeof(Program).Assembly);
        services.AddEndpointsApiExplorer();

        // Configure FormOptions for large file uploads (500 MB)
        services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(options =>
        {
            options.ValueLengthLimit = int.MaxValue;
            options.MultipartBodyLengthLimit = 500L * 1024L * 1024L; // 500 MB
            options.MultipartHeadersLengthLimit = int.MaxValue;
        });

        // Auth
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IEmployeeHubApiService, EmployeeHubApiService>();

        // User Module
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IFileStorageService, LocalFileStorageService>();
        services.AddScoped<IUserService, UserService>();

        // Karma & Gamification Module (Phase 8)
        services.AddScoped<IKarmaRepository, KarmaRepository>();
        services.AddScoped<IKarmaService, KarmaService>();

        // Content Foundation & Interactions Module
        services.AddScoped<IContentInteractionRepository, ContentInteractionRepository>();
        services.AddScoped<IContentInteractionService, ContentInteractionService>();

        // Communities & Membership Module
        services.AddScoped<ICommunityRepository, CommunityRepository>();
        services.AddScoped<ICommunityService, CommunityService>();

        // Post & Article Engines Module
        services.AddScoped<IPostRepository, PostRepository>();
        services.AddScoped<IPostService, PostService>();
        services.AddScoped<IArticleRepository, ArticleRepository>();
        services.AddScoped<IArticleService, ArticleService>();

        // Media Channels Module (Video & Podcast)
        services.AddScoped<IVideoRepository, VideoRepository>();
        services.AddScoped<IVideoService, VideoService>();
        services.AddScoped<IPodcastRepository, PodcastRepository>();
        services.AddScoped<IPodcastService, PodcastService>();

        // Dashboard Feed & Hot Posts Ranking Module (Phase 8)
        services.AddScoped<IFeedRepository, FeedRepository>();
        services.AddScoped<IFeedService, FeedService>();

        // Search Module (Phase 9)
        services.AddScoped<ISearchRepository, SearchRepository>();
        services.AddScoped<ISearchService, SearchService>();

        // Audit Trail Infrastructure (Phase 10.1)
        services.AddScoped<IAuditLogRepository, AuditLogRepository>();
        services.AddScoped<IAuditLogService, AuditLogService>();

        // Suspension Guard (Phase 10.2) — reusable across content creation workflows
        services.AddScoped<ISuspensionGuard, SuspensionGuard>();

        // Jobs & Notifications Module (Phase 11)
        services.AddScoped<IJobRepository, JobRepository>();
        services.AddScoped<IJobService, JobService>();
        services.AddScoped<INotificationRepository, NotificationRepository>();
        services.AddScoped<INotificationService, NotificationService>();

        // SMTP & Email Notification Service
        services.Configure<SmtpSettings>(configuration.GetSection("SmtpSettings"));
        services.AddScoped<IEmailService, EmailService>();

        // Abbreviations Module
        services.AddScoped<IAbbreviationRepository, AbbreviationRepository>();
        services.AddScoped<IAbbreviationService, AbbreviationService>();
    }

    private static void AddSwagger(IServiceCollection services)
    {
        var jwtScheme = new OpenApiSecurityScheme
        {
            Name = "Authorization",
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            In = ParameterLocation.Header,
            Description = "Enter your JWT token. Example: Bearer eyJhbGci..."
        };

        var jwtRequirement = new OpenApiSecurityRequirement
        {
            {
                new OpenApiSecurityScheme
                {
                    Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
                },
                Array.Empty<string>()
            }
        };

        services.AddSwaggerGen(c =>
        {
            c.SwaggerDoc("v1", new OpenApiInfo
            {
                Title = "Knome Enterprise API",
                Version = "v1",
                Description = "Enterprise-grade ASP.NET Core 9 Web API for the Knome platform."
            });

            c.CustomSchemaIds(type => type.FullName);

            c.AddSecurityDefinition("Bearer", jwtScheme);
            c.AddSecurityRequirement(jwtRequirement);
        });
    }
}