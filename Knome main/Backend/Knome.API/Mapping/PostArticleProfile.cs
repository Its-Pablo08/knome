using System.Linq;
using AutoMapper;
using Knome.API.DTOs.Articles;
using Knome.API.DTOs.Posts;
using Knome.API.Models;

namespace Knome.API.Mapping;

public class PostArticleProfile : Profile
{
    public PostArticleProfile()
    {
        CreateMap<User, MentionedUserDto>();

        CreateMap<PostAttachment, PostAttachmentDto>();

        CreateMap<Post, PostDto>()
            .ForMember(dest => dest.AuthorEmployeeId, opt => opt.MapFrom(src => src.AuthorUser != null ? src.AuthorUser.EmployeeId : string.Empty))
            .ForMember(dest => dest.AuthorFullName, opt => opt.MapFrom(src => src.AuthorUser != null ? src.AuthorUser.FullName : "Unknown"))
            .ForMember(dest => dest.AuthorDesignation, opt => opt.MapFrom(src => src.AuthorUser != null ? src.AuthorUser.Designation : null))
            .ForMember(dest => dest.AuthorProfilePhotoUrl, opt => opt.MapFrom(src => src.AuthorUser != null ? src.AuthorUser.ProfilePhotoUrl : null))
            .ForMember(dest => dest.AttachmentUrls, opt => opt.MapFrom(src => src.PostAttachments.Where(pa => !pa.FileUrl.StartsWith("blob:")).Select(pa => pa.FileUrl).ToList()))
            .ForMember(dest => dest.Attachments, opt => opt.MapFrom(src => src.PostAttachments.Where(pa => !pa.FileUrl.StartsWith("blob:"))))
            .ForMember(dest => dest.MentionedUsers, opt => opt.MapFrom(src => src.MentionedUsers))
            .ForMember(dest => dest.EngagementSummary, opt => opt.Ignore());

        CreateMap<ArticleVersion, ArticleVersionDto>()
            .ForMember(dest => dest.EditedByUserName, opt => opt.MapFrom(src => src.EditedByUser != null ? src.EditedByUser.FullName : "Unknown"));

        CreateMap<ArticleAttachment, ArticleAttachmentDto>();

        CreateMap<Article, ArticleDto>()
            .ForMember(dest => dest.AuthorEmployeeId, opt => opt.MapFrom(src => src.AuthorUser != null ? src.AuthorUser.EmployeeId : string.Empty))
            .ForMember(dest => dest.AuthorFullName, opt => opt.MapFrom(src => src.AuthorUser != null ? src.AuthorUser.FullName : "Unknown"))
            .ForMember(dest => dest.AuthorDesignation, opt => opt.MapFrom(src => src.AuthorUser != null ? src.AuthorUser.Designation : null))
            .ForMember(dest => dest.AuthorProfilePhotoUrl, opt => opt.MapFrom(src => src.AuthorUser != null ? src.AuthorUser.ProfilePhotoUrl : null))
            .ForMember(dest => dest.CategoryName, opt => opt.MapFrom(src => src.Category != null ? src.Category.Name : string.Empty))
            .ForMember(dest => dest.Tags, opt => opt.MapFrom(src => src.ArticleTags != null ? src.ArticleTags.Select(t => t.Tag).ToList() : new List<string>()))
            .ForMember(dest => dest.AttachmentUrls, opt => opt.MapFrom(src => src.ArticleAttachments != null ? src.ArticleAttachments.Select(pa => pa.FileUrl).ToList() : new List<string>()))
            .ForMember(dest => dest.Attachments, opt => opt.MapFrom(src => src.ArticleAttachments != null ? src.ArticleAttachments : new List<ArticleAttachment>()))
            .ForMember(dest => dest.VersionsCount, opt => opt.MapFrom(src => src.ArticleVersions != null ? src.ArticleVersions.Count : 0))
            .ForMember(dest => dest.EngagementSummary, opt => opt.Ignore());

        CreateMap<Article, ArticleDetailDto>()
            .IncludeBase<Article, ArticleDto>()
            .ForMember(dest => dest.Versions, opt => opt.MapFrom(src => src.ArticleVersions != null ? src.ArticleVersions.OrderByDescending(v => v.EditedDate).ToList() : new List<ArticleVersion>()));
    }
}
