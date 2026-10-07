using FluentValidation;
using Knome.API.DTOs.Clips;

namespace Knome.API.Validators.Clips;

public class CreateClipValidator : AbstractValidator<CreateClipDto>
{
    public CreateClipValidator()
    {
        RuleFor(x => x.Title)
            .NotEmpty().WithMessage("Clip title/caption is required.")
            .MaximumLength(250).WithMessage("Clip title/caption cannot exceed 250 characters.");

        RuleFor(x => x.VideoUrl)
            .NotEmpty().WithMessage("Video URL is required.")
            .MaximumLength(1000).WithMessage("Video URL cannot exceed 1000 characters.");

        RuleFor(x => x.Description)
            .MaximumLength(2000).WithMessage("Description cannot exceed 2000 characters.");

        RuleFor(x => x.Hashtags)
            .MaximumLength(500).WithMessage("Hashtags cannot exceed 500 characters.");

        RuleFor(x => x.Visibility)
            .Must(v => string.IsNullOrWhiteSpace(v) || v == "Public" || v == "Community" || v == "Specific")
            .WithMessage("Visibility must be 'Public', 'Community', or 'Specific'.");

        RuleFor(x => x.DurationSeconds)
            .InclusiveBetween(1, 30).WithMessage("Clip duration must be between 1 and 30 seconds. Videos greater than 30 seconds cannot be uploaded as clips.");

        RuleFor(x => x.Status)
            .Must(s => string.IsNullOrWhiteSpace(s) || s == "Published" || s == "Draft")
            .WithMessage("Status must be 'Published' or 'Draft'.");
    }
}
