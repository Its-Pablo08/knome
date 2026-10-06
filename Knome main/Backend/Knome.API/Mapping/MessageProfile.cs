using AutoMapper;
using Knome.API.DTOs.Messages;
using Knome.API.Models;

namespace Knome.API.Mapping;

public class MessageProfile : Profile
{
    public MessageProfile()
    {
        CreateMap<UserMessage, UserMessageDto>()
            .ForMember(dest => dest.SenderName, opt => opt.MapFrom(src => src.Sender != null ? src.Sender.FullName : string.Empty))
            .ForMember(dest => dest.SenderAvatarUrl, opt => opt.MapFrom(src => src.Sender != null ? src.Sender.ProfilePhotoUrl : null))
            .ForMember(dest => dest.ReceiverName, opt => opt.MapFrom(src => src.Receiver != null ? src.Receiver.FullName : string.Empty))
            .ForMember(dest => dest.ReceiverAvatarUrl, opt => opt.MapFrom(src => src.Receiver != null ? src.Receiver.ProfilePhotoUrl : null))
            .ForMember(dest => dest.Content, opt => opt.Ignore())
            .ForMember(dest => dest.ParentContent, opt => opt.Ignore())
            .ForMember(dest => dest.ParentSenderName, opt => opt.Ignore())
            .ForMember(dest => dest.Reactions, opt => opt.Ignore());
    }
}
