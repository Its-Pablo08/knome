using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Knome.API.Constants;
using Knome.API.Exceptions;
using Knome.API.Responses;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace Knome.API.Middleware;

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "An unhandled exception occurred during request execution.");
            await HandleExceptionAsync(context, ex);
        }
    }

    private static Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        context.Response.ContentType = "application/json";
        
        var (statusCode, message, errors) = exception switch
        {
            NotFoundException notFoundEx => (
                StatusCodes.Status404NotFound,
                notFoundEx.Message,
                null
            ),
            BadRequestException badRequestEx => (
                StatusCodes.Status400BadRequest,
                badRequestEx.Message,
                null
            ),
            ConflictException conflictEx => (
                StatusCodes.Status409Conflict,
                conflictEx.Message,
                null
            ),
            ForbiddenException forbiddenEx => (
                StatusCodes.Status403Forbidden,
                forbiddenEx.Message,
                null
            ),
            UnauthorizedException unauthEx => (
                StatusCodes.Status403Forbidden,
                unauthEx.Message,
                null
            ),
            FluentValidation.ValidationException valEx => (
                StatusCodes.Status400BadRequest,
                ApiConstants.Messages.ValidationError,
                valEx.Errors.Select(e => e.ErrorMessage).ToList()
            ),
            InvalidOperationException invOpEx when invOpEx.Message.Contains("transient failure", StringComparison.OrdinalIgnoreCase)
                                                || invOpEx.Message.Contains("EnableRetryOnFailure", StringComparison.OrdinalIgnoreCase)
                                                || invOpEx.InnerException is Microsoft.Data.SqlClient.SqlException => (
                StatusCodes.Status503ServiceUnavailable,
                "The database is temporarily busy or reconnecting. Please retry shortly.",
                null
            ),
            Microsoft.Data.SqlClient.SqlException => (
                StatusCodes.Status503ServiceUnavailable,
                "A database error occurred. Please try again later.",
                null
            ),
            InvalidOperationException invOpEx => (
                StatusCodes.Status400BadRequest,
                invOpEx.Message,
                null
            ),
            _ => (
                StatusCodes.Status500InternalServerError,
                ApiConstants.Messages.InternalServerError,
                null
            )
        };

        context.Response.StatusCode = statusCode;

        var response = ApiResponse.FailureResponse(statusCode, message, errors);
        
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        var json = JsonSerializer.Serialize(response, options);
        return context.Response.WriteAsync(json);
    }
}
