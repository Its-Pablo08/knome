using System.Collections.Generic;

namespace Knome.API.Responses;

public class ApiResponse
{
    public bool Success { get; set; }
    public int StatusCode { get; set; }
    public string Message { get; set; } = string.Empty;
    public List<string>? Errors { get; set; }

    public ApiResponse()
    {
    }

    public ApiResponse(bool success, int statusCode, string message, List<string>? errors = null)
    {
        Success = success;
        StatusCode = statusCode;
        Message = message;
        Errors = errors;
    }

    public static ApiResponse SuccessResponse(int statusCode, string message)
    {
        return new ApiResponse(true, statusCode, message);
    }

    public static ApiResponse FailureResponse(int statusCode, string message, List<string>? errors = null)
    {
        return new ApiResponse(false, statusCode, message, errors);
    }

    public static ApiResponse ErrorResponse(int statusCode, string message, List<string>? errors = null)
    {
        return FailureResponse(statusCode, message, errors);
    }
}

public class ApiResponse<T> : ApiResponse
{
    public T? Data { get; set; }

    public ApiResponse()
    {
    }

    public ApiResponse(bool success, int statusCode, string message, T? data, List<string>? errors = null)
        : base(success, statusCode, message, errors)
    {
        Data = data;
    }

    public static ApiResponse<T> SuccessResponse(int statusCode, string message, T? data)
    {
        return new ApiResponse<T>(true, statusCode, message, data);
    }

    public static new ApiResponse<T> FailureResponse(int statusCode, string message, List<string>? errors = null)
    {
        return new ApiResponse<T>(false, statusCode, message, default, errors);
    }

    public static new ApiResponse<T> ErrorResponse(int statusCode, string message, List<string>? errors = null)
    {
        return FailureResponse(statusCode, message, errors);
    }
}

public class PagedResponse<T>
{
    public List<T> Items { get; set; } = new();
    public int PageNumber { get; set; }
    public int PageSize { get; set; }
    public int TotalCount { get; set; }
    public int TotalPages => PageSize > 0 ? (int)System.Math.Ceiling((double)TotalCount / PageSize) : 0;
    public bool HasNextPage => PageNumber < TotalPages;
    public bool HasPreviousPage => PageNumber > 1;

    public PagedResponse() { }

    public PagedResponse(List<T> items, int pageNumber, int pageSize, int totalCount)
    {
        Items = items;
        PageNumber = pageNumber;
        PageSize = pageSize;
        TotalCount = totalCount;
    }

    public static PagedResponse<T> Create(List<T> items, int pageNumber, int pageSize, int totalCount)
    {
        return new PagedResponse<T>(items, pageNumber, pageSize, totalCount);
    }
}
