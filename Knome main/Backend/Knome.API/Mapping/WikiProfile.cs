using System.Linq;
using AutoMapper;
using Knome.API.DTOs.Wiki;
using Knome.API.Models;

namespace Knome.API.Mapping;

public class WikiProfile : Profile
{
    public WikiProfile()
    {
        CreateMap<Wiki, WikiDto>()
            .ForMember(dest => dest.CreatedByUserName, opt => opt.MapFrom(src => src.CreatedByUser != null ? src.CreatedByUser.FullName : string.Empty))
            .ForMember(dest => dest.CreatedByUserEmployeeId, opt => opt.MapFrom(src => src.CreatedByUser != null ? src.CreatedByUser.EmployeeId : string.Empty))
            .ForMember(dest => dest.CreatedByUserDesignation, opt => opt.MapFrom(src => src.CreatedByUser != null ? src.CreatedByUser.Designation : null))
            .ForMember(dest => dest.CreatedByUserAvatar, opt => opt.MapFrom(src => src.CreatedByUser != null ? src.CreatedByUser.ProfilePhotoUrl : null))
            .ForMember(dest => dest.CategoryName, opt => opt.MapFrom(src => src.Category != null ? src.Category.Name : null))
            .ForMember(dest => dest.Tags, opt => opt.MapFrom(src => src.WikiTags.Select(t => t.Tag).ToList()))
            .ForMember(dest => dest.SectionsCount, opt => opt.MapFrom(src => src.WikiSections.Count(s => !s.IsDeleted)))
            .ForMember(dest => dest.CollaboratorsCount, opt => opt.MapFrom(src => src.WikiCollaborators.Count))
            .ForMember(dest => dest.VersionsCount, opt => opt.MapFrom(src => src.WikiVersions.Count));

        CreateMap<Wiki, WikiDetailDto>()
            .IncludeBase<Wiki, WikiDto>()
            .ForMember(dest => dest.Sections, opt => opt.Ignore())
            .ForMember(dest => dest.Collaborators, opt => opt.Ignore())
            .ForMember(dest => dest.Shares, opt => opt.Ignore())
            .ForMember(dest => dest.RecentActivities, opt => opt.Ignore());

        CreateMap<WikiSection, WikiSectionDto>()
            .ForMember(dest => dest.CreatedByUserName, opt => opt.MapFrom(src => src.CreatedByUser != null ? src.CreatedByUser.FullName : string.Empty))
            .ForMember(dest => dest.CreatedByUserAvatar, opt => opt.MapFrom(src => src.CreatedByUser != null ? src.CreatedByUser.ProfilePhotoUrl : null))
            .ForMember(dest => dest.Subsections, opt => opt.Ignore())
            .ForMember(dest => dest.Collaborators, opt => opt.Ignore());

        CreateMap<WikiCollaborator, WikiCollaboratorDto>()
            .ForMember(dest => dest.UserName, opt => opt.MapFrom(src => src.User != null ? src.User.FullName : string.Empty))
            .ForMember(dest => dest.EmployeeId, opt => opt.MapFrom(src => src.User != null ? src.User.EmployeeId : string.Empty))
            .ForMember(dest => dest.Designation, opt => opt.MapFrom(src => src.User != null ? src.User.Designation : null))
            .ForMember(dest => dest.Department, opt => opt.MapFrom(src => src.User != null ? src.User.Department : null))
            .ForMember(dest => dest.AvatarUrl, opt => opt.MapFrom(src => src.User != null ? src.User.ProfilePhotoUrl : null))
            .ForMember(dest => dest.AddedByUserName, opt => opt.MapFrom(src => src.AddedByUser != null ? src.AddedByUser.FullName : string.Empty))
            .ForMember(dest => dest.SectionTitle, opt => opt.MapFrom(src => src.Section != null ? src.Section.Title : null));

        CreateMap<WikiShare, WikiShareDto>()
            .ForMember(dest => dest.SharedByUserName, opt => opt.MapFrom(src => src.SharedByUser != null ? src.SharedByUser.FullName : string.Empty));

        CreateMap<WikiVersion, WikiVersionDto>()
            .ForMember(dest => dest.CreatedByUserName, opt => opt.MapFrom(src => src.CreatedByUser != null ? src.CreatedByUser.FullName : string.Empty))
            .ForMember(dest => dest.CreatedByUserAvatar, opt => opt.MapFrom(src => src.CreatedByUser != null ? src.CreatedByUser.ProfilePhotoUrl : null))
            .ForMember(dest => dest.SectionTitle, opt => opt.MapFrom(src => src.Section != null ? src.Section.Title : null));
    }
}
