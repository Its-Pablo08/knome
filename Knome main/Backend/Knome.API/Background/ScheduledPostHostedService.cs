using System;
using System.Threading;
using System.Threading.Tasks;
using Knome.API.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Knome.API.Background;

/// <summary>
/// Periodically checks and publishes scheduled posts whose scheduled time has arrived.
/// </summary>
public class ScheduledPostHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ScheduledPostHostedService> _logger;
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(15);

    public ScheduledPostHostedService(IServiceScopeFactory scopeFactory, ILogger<ScheduledPostHostedService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var postRepo = scope.ServiceProvider.GetRequiredService<IPostRepository>();
                var notifService = scope.ServiceProvider.GetService<INotificationService>();
                var publishedPosts = await postRepo.PublishDueScheduledPostsAsync();
                if (publishedPosts.Count > 0)
                {
                    _logger.LogInformation("ScheduledContentPublisher: auto-published {Count} scheduled post(s) to live feed.", publishedPosts.Count);
                    if (notifService != null)
                    {
                        foreach (var post in publishedPosts)
                        {
                            try
                            {
                                await notifService.PublishAsync(
                                    post.AuthorUserId,
                                    Constants.NotificationTypes.PostPublished,
                                    "Your scheduled post has successfully gone live.",
                                    relatedContentType: Constants.ContentTypes.Post,
                                    relatedContentId: post.PostId);
                            }
                            catch (Exception notifEx)
                            {
                                _logger.LogWarning(notifEx, "Failed to send live notification for scheduled post {PostId}", post.PostId);
                            }
                        }
                    }
                }

                var articleRepo = scope.ServiceProvider.GetRequiredService<IArticleRepository>();
                var publishedArticles = await articleRepo.PublishDueScheduledArticlesAsync();
                if (publishedArticles.Count > 0)
                {
                    _logger.LogInformation("ScheduledContentPublisher: auto-published {Count} scheduled article(s) to live platform.", publishedArticles.Count);
                    if (notifService != null)
                    {
                        foreach (var article in publishedArticles)
                        {
                            try
                            {
                                await notifService.PublishAsync(
                                    article.AuthorUserId,
                                    Constants.NotificationTypes.ArticlePublished,
                                    $"Your scheduled article \"{article.Title}\" has successfully gone live.",
                                    relatedContentType: Constants.ContentTypes.Article,
                                    relatedContentId: article.ArticleId);
                            }
                            catch (Exception notifEx)
                            {
                                _logger.LogWarning(notifEx, "Failed to send live notification for scheduled article {ArticleId}", article.ArticleId);
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "ScheduledPostPublisher: cycle notice.");
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }
}
