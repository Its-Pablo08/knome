using System.Linq;
using FluentValidation;
using Knome.API.Constants;
using Knome.API.DTOs.User;

namespace Knome.API.Validators.User;

public class ChangeRoleValidator : AbstractValidator<ChangeRoleDto>
{
    private static readonly HashSet<string> ValidRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        Roles.Employee,
        "Employee",
        "EMP",
        Roles.CommunityAdmin,
        "Community Admin",
        "Community Administrator",
        "CommunityAdmin",
        "CADM",
        Roles.HRAdmin,
        "HR Admin",
        "HR Administrator",
        "HRAdmin",
        "HRADM",
        Roles.SystemAdmin,
        "System Admin",
        "System Administrator",
        "SystemAdmin",
        "SYSADM"
    };

    public ChangeRoleValidator()
    {
        RuleFor(x => x.RoleNames)
            .NotEmpty().WithMessage("At least one role must be assigned.")
            .Must(roles => roles != null && roles.All(r => ValidRoles.Contains(r)))
            .WithMessage($"Invalid role name specified. Valid roles are: Employee, Community Admin, HR Admin, System Admin");
    }
}
