using System;
using System.Text.RegularExpressions;

namespace Knome.API.Common;

/// <summary>
/// Server-side HTML sanitizer to neutralize XSS vectors while preserving legitimate rich text formatting.
/// </summary>
public static class HtmlSanitizerHelper
{
    private static readonly Regex DangerousTagsRegex = new(
        @"<\s*(script|iframe|object|embed|applet|form|input|button|select|textarea|link|meta|style|base|frame|frameset)[^>]*?>.*?<\s*/\s*\1\s*>|<\s*(script|iframe|object|embed|applet|form|input|button|select|textarea|link|meta|style|base|frame|frameset)[^>]*?>",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled);

    private static readonly Regex EventHandlersRegex = new(
        @"\s+on[a-zA-Z]+\s*=\s*(""[^""]*""|'[^']*'|[^\s>]+)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex JavascriptProtocolsRegex = new(
        @"(href|src)\s*=\s*[""']?\s*(javascript|data|vbscript):[^""'>]*[""']?",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>
    /// Sanitizes an HTML string by removing dangerous tags, script vectors, and malicious event handlers.
    /// </summary>
    public static string Sanitize(string? html)
    {
        if (string.IsNullOrWhiteSpace(html))
            return string.Empty;

        // 1. Remove dangerous script/iframe/object tags and their contents
        var sanitized = DangerousTagsRegex.Replace(html, string.Empty);

        // 2. Remove all inline event handlers (onload, onerror, onclick, etc.)
        sanitized = EventHandlersRegex.Replace(sanitized, string.Empty);

        // 3. Remove dangerous protocols (javascript:, vbscript:, data:) in href and src
        sanitized = JavascriptProtocolsRegex.Replace(sanitized, "$1=\"#\"");

        return sanitized.Trim();
    }
}
