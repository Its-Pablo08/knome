using FluentValidation;
using Knome.API.DTOs.Wiki;

namespace Knome.API.Validators.Wiki;

public class CreateWikiSectionValidator : AbstractValidator<CreateWikiSectionDto>
{
    public CreateWikiSectionValidator()
    {
        RuleFor(x => x.Title)
            .NotEmpty().WithMessage("Section title is required.")
            .MaximumLength(200).WithMessage("Section title cannot exceed 200 characters.");

        RuleFor(x => x.ContentHtml)
            .NotEmpty().WithMessage("Section content is required.");
    }
}

public class UpdateWikiSectionValidator : AbstractValidator<UpdateWikiSectionDto>
{
    public UpdateWikiSectionValidator()
    {
        RuleFor(x => x.Title)
            .NotEmpty().WithMessage("Section title is required.")
            .MaximumLength(200).WithMessage("Section title cannot exceed 200 characters.");

        RuleFor(x => x.ContentHtml)
            .NotEmpty().WithMessage("Section content is required.");
    }
}
