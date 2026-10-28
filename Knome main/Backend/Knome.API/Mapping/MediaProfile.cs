using System.Linq;
using AutoMapper;
using Knome.API.DTOs.Podcasts;
using Knome.API.DTOs.Videos;
using Knome.API.Models;

namespace Knome.API.Mapping;

public class MediaProfile : Profile
{
    public MediaProfile()
    {
        CreateMap<Video, VideoDto>()
            .ForMember(dest => dest.UploaderEmployeeId, opt => opt.MapFrom(src => src.UploaderUser != null ? src.UploaderUser.EmployeeId : string.Empty))
            .ForMember(dest => dest.UploaderFullName, opt => opt.MapFrom(src => src.UploaderUser != null ? src.UploaderUser.FullName : "Unknown"))
            .ForMember(dest => dest.UploaderDesignation, opt => opt.MapFrom(src => src.UploaderUser != null ? src.UploaderUser.Designation : null))
            .ForMember(dest => dest.UploaderProfilePhotoUrl, opt => opt.MapFrom(src => src.UploaderUser != null ? src.UploaderUser.ProfilePhotoUrl : null))
            .ForMember(dest => dest.CategoryName, opt => opt.MapFrom(src => 
                src.Category != null ? src.Category.Name :
                src.CategoryId == 13 ? "Training & Tutorials" :
                src.CategoryId == 14 ? "Townhalls" :
                src.CategoryId == 15 ? "Engineering Tech Talks" :
                src.CategoryId == 16 ? "Leadership Updates" : "Training & Tutorials"))
            .ForMember(dest => dest.Tags, opt => opt.MapFrom(src => src.VideoTags.Select(vt => vt.Tag).ToList()))
            .ForMember(dest => dest.EngagementSummary, opt => opt.Ignore());

        CreateMap<PodcastSeries, PodcastSeriesDto>()
            .ForMember(dest => dest.EpisodeCount, opt => opt.MapFrom(src => src.Podcasts != null ? src.Podcasts.Count(p => p.IsActive) : 0));

        CreateMap<Podcast, PodcastDto>()
            .ForMember(dest => dest.UploaderEmployeeId, opt => opt.MapFrom(src => src.UploaderUser != null ? src.UploaderUser.EmployeeId : string.Empty))
            .ForMember(dest => dest.UploaderFullName, opt => opt.MapFrom(src => src.UploaderUser != null ? src.UploaderUser.FullName : "Unknown"))
            .ForMember(dest => dest.UploaderDesignation, opt => opt.MapFrom(src => src.UploaderUser != null ? src.UploaderUser.Designation : null))
            .ForMember(dest => dest.UploaderProfilePhotoUrl, opt => opt.MapFrom(src => src.UploaderUser != null ? src.UploaderUser.ProfilePhotoUrl : null))
            .ForMember(dest => dest.CategoryName, opt => opt.MapFrom(src => src.Category != null ? src.Category.Name : null))
            .ForMember(dest => dest.SeriesTitle, opt => opt.MapFrom(src => src.Series != null ? src.Series.Title : null))
            .ForMember(dest => dest.EngagementSummary, opt => opt.Ignore());
    }
}
