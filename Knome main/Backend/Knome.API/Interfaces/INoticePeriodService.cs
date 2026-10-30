using System.Threading.Tasks;
using Knome.API.DTOs.Settings;

namespace Knome.API.Interfaces;

public interface INoticePeriodService
{
    Task<NoticePeriodConfigDto> GetConfigAsync();
    Task<NoticePeriodConfigDto> SetPolicyEnabledAsync(bool isEnabled, int actorUserId);
    Task<NoticePeriodConfigDto> ToggleEmployeeNoticeAsync(ToggleEmployeeNoticeDto dto, int actorUserId);
    Task<bool> IsUserInNoticePeriodAsync(int userId);
    Task<bool> IsUserInNoticePeriodAsync(string employeeIdOrEmail);
    Task EnsureCanSchedulePostAsync(int userId);
    Task<NoticePeriodStatusResultDto> CheckUserNoticeStatusAsync(int userId);
    Task<NoticePeriodStatusResultDto> CheckUserNoticeStatusAsync(string identifier);
}
