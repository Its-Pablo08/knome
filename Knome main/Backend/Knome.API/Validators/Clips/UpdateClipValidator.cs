using FluentValidation;
using Knome.API.DTOs.Clips;

namespace Knome.API.Validators.Clips;

public class UpdateClipValidator : AbstractValidator<UpdateClipDto>
{
    public UpdateClipValidator()
    {
        RuleFor(x => x.Title)
            .MaximumLength(250).WithMessage("Clip title/caption cannot exceed 250 characters.");

        RuleFor(x => x.Description)
            .MaximumLength(2000).WithMessage("Description cannot exceed 2000 characters.");

        RuleFor(x => x.Hashtags)
            .MaximumLength(500).WithMessage("Hashtags cannot exceed 500 characters.");

        RuleFor(x => x.Visibility)
            .Must(v => string.IsNullOrWhiteSpace(v) || v == "Public" || v == "Community" || v == "Specific")
            .WithMessage("Visibility must be 'Public', 'Community', or 'Specific'.");

        RuleFor(x => x.Status)
            .Must(s => string.IsNullOrWhiteSpace(s) || s == "Published" || s == "Draft" || s == "Archived" || s == "Removed")
            .WithMessage("Status must be 'Published', 'Draft', 'Archived', or 'Removed'.");
    }
}
