using FluentValidation;
using Knome.API.DTOs.Messages;

namespace Knome.API.Validators.Messages;

public class SendMessageDtoValidator : AbstractValidator<SendMessageDto>
{
    public SendMessageDtoValidator()
    {
        RuleFor(x => x.ReceiverId)
            .GreaterThan(0).WithMessage("ReceiverId must be a valid user ID.");

        RuleFor(x => x)
            .Must(x => !string.IsNullOrWhiteSpace(x.Content) || !string.IsNullOrWhiteSpace(x.AttachmentsJson))
            .WithMessage("Message content or an attachment is required.");

        RuleFor(x => x.Content)
            .Must(c => string.IsNullOrEmpty(c) || c.Trim().Length <= 4000)
            .WithMessage("Message content cannot exceed 4000 characters.");
    }
}
