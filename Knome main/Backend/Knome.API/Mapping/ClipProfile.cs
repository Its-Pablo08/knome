using AutoMapper;
using Knome.API.DTOs.Clips;
using Knome.API.Models;

namespace Knome.API.Mapping;

public class ClipProfile : Profile
{
    public ClipProfile()
    {
        CreateMap<Clip, ClipDto>()
            .ForMember(dest => dest.CreatorName, opt => opt.MapFrom(src => src.CreatedByUser != null ? src.CreatedByUser.FullName : string.Empty))
            .ForMember(dest => dest.CreatorAvatar, opt => opt.MapFrom(src => src.CreatedByUser != null ? src.CreatedByUser.ProfilePhotoUrl : null))
            .ForMember(dest => dest.CreatorRole, opt => opt.MapFrom(src => src.CreatedByUser != null ? src.CreatedByUser.Designation : null))
            .ForMember(dest => dest.CreatorDepartment, opt => opt.MapFrom(src => src.CreatedByUser != null ? src.CreatedByUser.Department : null))
            .ForMember(dest => dest.CommunityName, opt => opt.MapFrom(src => src.Community != null ? src.Community.Name : null));

        CreateMap<CreateClipDto, Clip>();
        CreateMap<UpdateClipDto, Clip>()
            .ForAllMembers(opts => opts.Condition((src, dest, srcMember) => srcMember != null));
    }
}
