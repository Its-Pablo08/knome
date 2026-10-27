using System.Linq;
using AutoMapper;
using Knome.API.DTOs.User;

namespace Knome.API.Mapping;

public class UserProfile : Profile
{
    public UserProfile()
    {
        CreateMap<Models.User, UserProfileDto>()
            .ForMember(dest => dest.DepartmentName, opt => opt.MapFrom(src => src.Department != null ? src.Department.Name : null))
            .ForMember(dest => dest.Skills, opt => opt.MapFrom(src => src.UserSkills.Select(s => s.Skill).ToList()))
            .ForMember(dest => dest.Interests, opt => opt.MapFrom(src => src.UserInterests.Select(i => i.Interest).ToList()))
            .ForMember(dest => dest.Roles, opt => opt.MapFrom(src => src.Roles.Select(r => r.RoleName).ToList()))
            .ForMember(dest => dest.RoleName, opt => opt.MapFrom(src => src.Roles.FirstOrDefault() != null ? src.Roles.First().RoleName : "Employee"))
            .ForMember(dest => dest.Role, opt => opt.MapFrom(src => src.Roles.FirstOrDefault() != null ? src.Roles.First().RoleCode : "EMP"))
            .ForMember(dest => dest.FollowersCount, opt => opt.MapFrom(src => src.FollowerFollowingUsers != null ? src.FollowerFollowingUsers.Count : 0))
            .ForMember(dest => dest.FollowingCount, opt => opt.MapFrom(src => src.FollowerFollowerUsers != null ? src.FollowerFollowerUsers.Count : 0))
            .ForMember(dest => dest.KarmaPoints, opt => opt.MapFrom(src => src.KarmaBalance != null ? src.KarmaBalance.TotalPoints : 0))
            .ForMember(dest => dest.KarmaBadgeLevel, opt => opt.MapFrom(src => src.KarmaBalance != null ? src.KarmaBalance.BadgeLevel : "Bronze"));

        CreateMap<Models.User, UserSummaryDto>()
            .ForMember(dest => dest.DepartmentName, opt => opt.MapFrom(src => src.Department != null ? src.Department.Name : null))
            .ForMember(dest => dest.Roles, opt => opt.MapFrom(src => src.Roles.Select(r => r.RoleName).ToList()))
            .ForMember(dest => dest.RoleName, opt => opt.MapFrom(src => src.Roles.FirstOrDefault() != null ? src.Roles.First().RoleName : "Employee"))
            .ForMember(dest => dest.Role, opt => opt.MapFrom(src => src.Roles.FirstOrDefault() != null ? src.Roles.First().RoleCode : "EMP"))
            .ForMember(dest => dest.KarmaPoints, opt => opt.MapFrom(src => src.KarmaBalance != null ? src.KarmaBalance.TotalPoints : 0))
            .ForMember(dest => dest.KarmaBadgeLevel, opt => opt.MapFrom(src => src.KarmaBalance != null ? src.KarmaBalance.BadgeLevel : "Bronze"))
            .ForMember(dest => dest.IsSuspended, opt => opt.MapFrom(src => src.IsPermanentlySuspended || (src.SuspendedUntil.HasValue && src.SuspendedUntil > Knome.API.Common.KnomeTime.Now)))
            .ForMember(dest => dest.SuspendedUntil, opt => opt.MapFrom(src => src.SuspendedUntil));

        CreateMap<Models.SuspensionRequest, SuspensionRequestDto>();
    }
}
