using System.Linq;
using AutoMapper;
using Knome.API.DTOs.Communities;
using Knome.API.Models;

namespace Knome.API.Mapping;

public class CommunityProfile : Profile
{
    public CommunityProfile()
    {
        CreateMap<Community, CommunityDto>()
            .ForMember(dest => dest.CategoryName, opt => opt.MapFrom(src => src.Category != null ? src.Category.Name : null))
            .ForMember(dest => dest.CreatedByUserName, opt => opt.MapFrom(src => src.CreatedByUser != null ? src.CreatedByUser.FullName : "Unknown"))
            .ForMember(dest => dest.CreatorAvatar, opt => opt.MapFrom(src => src.CreatedByUser != null ? src.CreatedByUser.ProfilePhotoUrl : null))
            .ForMember(dest => dest.CreatorEmployeeId, opt => opt.MapFrom(src => src.CreatedByUser != null ? src.CreatedByUser.EmployeeId : null))
            .ForMember(dest => dest.CreatorDesignation, opt => opt.MapFrom(src => src.CreatedByUser != null ? src.CreatedByUser.Designation : null))
            .ForMember(dest => dest.CreatorDepartment, opt => opt.MapFrom(src => src.CreatedByUser != null && src.CreatedByUser.Department != null ? src.CreatedByUser.Department.Name : null))
            .ForMember(dest => dest.MembersCount, opt => opt.MapFrom(src => src.CommunityMembers != null ? src.CommunityMembers.Count(m => m.Status == "Approved" || m.Status == "Active") : 0))
            .ForMember(dest => dest.PostsCount, opt => opt.MapFrom(src => src.CommunityPosts != null ? src.CommunityPosts.Count : 0))
            .ForMember(dest => dest.CurrentUserMembershipStatus, opt => opt.Ignore()) // Populated dynamically per request context
            .ForMember(dest => dest.IsCurrentUserAdmin, opt => opt.Ignore()); // Populated dynamically per request context

        CreateMap<CommunityMember, CommunityMemberDto>()
            .ForMember(dest => dest.EmployeeId, opt => opt.MapFrom(src => src.User != null ? src.User.EmployeeId : string.Empty))
            .ForMember(dest => dest.FullName, opt => opt.MapFrom(src => src.User != null ? src.User.FullName : "Unknown"))
            .ForMember(dest => dest.Designation, opt => opt.MapFrom(src => src.User != null ? src.User.Designation : null))
            .ForMember(dest => dest.ProfilePhotoUrl, opt => opt.MapFrom(src => src.User != null ? src.User.ProfilePhotoUrl : null))
            .ForMember(dest => dest.ApprovedByUserName, opt => opt.MapFrom(src => src.ApprovedByUser != null ? src.ApprovedByUser.FullName : null))
            .ForMember(dest => dest.IsCommAdmin, opt => opt.MapFrom(src => src.MemberType == CommunityMemberTypes.Admin))
            .ForMember(dest => dest.RoleName, opt => opt.MapFrom(src => src.MemberType == CommunityMemberTypes.Admin ? "Community Admin" : "Member"));
    }
}
