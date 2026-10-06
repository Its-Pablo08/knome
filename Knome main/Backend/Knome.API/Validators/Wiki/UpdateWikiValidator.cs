using FluentValidation;
using Knome.API.DTOs.Wiki;

namespace Knome.API.Validators.Wiki;

public class UpdateWikiValidator : AbstractValidator<UpdateWikiDto>
{
    public UpdateWikiValidator()
    {
        RuleFor(x => x.Title)
            .NotEmpty().WithMessage("Wiki title is required.")
            .MaximumLength(200).WithMessage("Wiki title cannot exceed 200 characters.");

        RuleFor(x => x.Description)
            .MaximumLength(500).WithMessage("Wiki description cannot exceed 500 characters.");

        RuleFor(x => x.ContentHtml)
            .NotEmpty().WithMessage("Wiki overview content is required.");

        RuleFor(x => x.Status)
            .Must(s => s == "Draft" || s == "Published" || s == "Archived")
            .WithMessage("Status must be 'Draft', 'Published', or 'Archived'.");
    }
}
