using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Knome.API.Constants;
using Knome.API.DTOs.Search;
using Knome.API.Interfaces;
using Microsoft.Extensions.Caching.Memory;

namespace Knome.API.Services;

public class SearchService : ISearchService
{
    private readonly ISearchRepository _repository;
    private readonly IContentInteractionService _interactionService;
    private readonly IMemoryCache _cache;
    private readonly ISystemSettingService _settingService;

    public SearchService(ISearchRepository repository, IContentInteractionService interactionService, IMemoryCache cache, ISystemSettingService settingService)
    {
        _repository = repository;
        _interactionService = interactionService;
        _cache = cache;
        _settingService = settingService;
    }

    public async Task<GlobalSearchResultDto> SearchAsync(GlobalSearchRequestDto request)
    {
        var result = await _repository.SearchGlobalAsync(request);

        var enablePosts = await _settingService.GetEnablePostsAsync();
        var enableArticles = await _settingService.GetEnableArticlesAsync();
        var enableVideos = await _settingService.GetEnableVideosAsync();
        var enablePodcasts = await _settingService.GetEnablePodcastsAsync();
        var enableWiki = await _settingService.GetEnableWikiAsync();
        var enableClips = await _settingService.GetEnableClipsAsync();

        result.Items = result.Items.Where(item => {
            if (item.ContentType == "Post" && !enablePosts) return false;
            if (item.ContentType == "Article" && !enableArticles) return false;
            if (item.ContentType == "Video" && !enableVideos) return false;
            if (item.ContentType == "Podcast" && !enablePodcasts) return false;
            if (item.ContentType == "Wiki" && !enableWiki) return false;
            if (item.ContentType == "Clip" && !enableClips) return false;
            return true;
        }).ToList();

        // Enrich the returned page of content hits with live engagement metrics.
        foreach (var item in result.Items)
        {
            var contentType = item.ContentType switch
            {
                "Post" => ContentTypes.Post,
                "Article" => ContentTypes.Article,
                "Video" => ContentTypes.Video,
                "Podcast" => ContentTypes.Podcast,
                "Wiki" => ContentTypes.Wiki,
                _ => null
            };

            if (contentType is null) continue;

            var summary = await _interactionService.GetContentSummaryAsync(contentType, item.Id, 0);
            item.EngagementScore = summary.EngagementScore;
        }

        return result;
    }

    public async Task RecordSearchAsync(int userId, string term)
    {
        if (string.IsNullOrWhiteSpace(term)) return;
        await _repository.RecordSearchAsync(userId, term.Trim());
        _cache.Remove("search_trending_terms");
    }

    public async Task<List<SearchHistoryDto>> GetSearchHistoryAsync(int userId, int count = 10)
        => await _repository.GetRecentSearchesAsync(userId, count);

    public async Task ClearSearchHistoryAsync(int userId, string? term = null)
        => await _repository.ClearSearchHistoryAsync(userId, term);

    public async Task<List<SearchSuggestionDto>> GetSuggestionsAsync(string query, int count = 8)
    {
        if (string.IsNullOrWhiteSpace(query)) return new List<SearchSuggestionDto>();

        var cacheKey = $"search_suggestions_{query.Trim().ToLower()}_{count}";
        if (!_cache.TryGetValue(cacheKey, out List<SearchSuggestionDto>? suggestions) || suggestions == null)
        {
            suggestions = await _repository.GetSuggestionsAsync(query.Trim(), count);
            _cache.Set(cacheKey, suggestions, TimeSpan.FromSeconds(30)); // 30-second cache for instant responsiveness
        }

        var enablePosts = await _settingService.GetEnablePostsAsync();
        var enableArticles = await _settingService.GetEnableArticlesAsync();
        var enableVideos = await _settingService.GetEnableVideosAsync();
        var enablePodcasts = await _settingService.GetEnablePodcastsAsync();
        var enableWiki = await _settingService.GetEnableWikiAsync();
        var enableClips = await _settingService.GetEnableClipsAsync();

        return suggestions.Where(item => {
            if (item.ContentType == "Post" && !enablePosts) return false;
            if (item.ContentType == "Article" && !enableArticles) return false;
            if (item.ContentType == "Video" && !enableVideos) return false;
            if (item.ContentType == "Podcast" && !enablePodcasts) return false;
            if (item.ContentType == "Wiki" && !enableWiki) return false;
            if (item.ContentType == "Clip" && !enableClips) return false;
            return true;
        }).ToList();
    }

    public async Task<List<string>> GetTrendingSearchesAsync(int count = 10)
    {
        const string cacheKey = "search_trending_terms";
        if (_cache.TryGetValue(cacheKey, out List<string>? cachedTrending) && cachedTrending != null)
        {
            return cachedTrending;
        }

        var trending = await _repository.GetTrendingSearchesAsync(count);
        _cache.Set(cacheKey, trending, TimeSpan.FromMinutes(5));
        return trending;
    }

    public async Task<List<SearchItemDto>> SearchUsersAsync(string query, int pageNumber, int pageSize)
        => await _repository.SearchUsersAsync(query, pageNumber, pageSize);

    public async Task<List<SearchItemDto>> SearchCommunitiesAsync(string query, int pageNumber, int pageSize)
        => await _repository.SearchCommunitiesAsync(query, pageNumber, pageSize);

    public async Task<List<SearchItemDto>> SearchContentAsync(string query, string? contentType, int pageNumber, int pageSize)
    {
        var enablePosts = await _settingService.GetEnablePostsAsync();
        var enableArticles = await _settingService.GetEnableArticlesAsync();
        var enableVideos = await _settingService.GetEnableVideosAsync();
        var enablePodcasts = await _settingService.GetEnablePodcastsAsync();
        var enableWiki = await _settingService.GetEnableWikiAsync();
        var enableClips = await _settingService.GetEnableClipsAsync();

        if (contentType == "Post" && !enablePosts) return new List<SearchItemDto>();
        if (contentType == "Article" && !enableArticles) return new List<SearchItemDto>();
        if (contentType == "Video" && !enableVideos) return new List<SearchItemDto>();
        if (contentType == "Podcast" && !enablePodcasts) return new List<SearchItemDto>();
        if (contentType == "Wiki" && !enableWiki) return new List<SearchItemDto>();
        if (contentType == "Clip" && !enableClips) return new List<SearchItemDto>();

        var items = await _repository.SearchContentAsync(query, contentType, pageNumber, pageSize);
        return items.Where(item => {
            if (item.ContentType == "Post" && !enablePosts) return false;
            if (item.ContentType == "Article" && !enableArticles) return false;
            if (item.ContentType == "Video" && !enableVideos) return false;
            if (item.ContentType == "Podcast" && !enablePodcasts) return false;
            if (item.ContentType == "Wiki" && !enableWiki) return false;
            if (item.ContentType == "Clip" && !enableClips) return false;
            return true;
        }).ToList();
    }
}
