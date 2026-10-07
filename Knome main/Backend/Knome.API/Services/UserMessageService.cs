using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using Knome.API.DTOs.Messages;
using Knome.API.Exceptions;
using Knome.API.Hubs;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace Knome.API.Services;

public class UserMessageService : IUserMessageService
{
    private readonly IUserMessageRepository _messageRepo;
    private readonly IUserRepository _userRepo;
    private readonly IMessageEncryptionService _encryptionService;
    private readonly IMapper _mapper;
    private readonly IHubContext<NotificationHub> _hubContext;
    private readonly INotificationService _notificationService;
    private readonly ILogger<UserMessageService> _logger;

    public UserMessageService(
        IUserMessageRepository messageRepo,
        IUserRepository userRepo,
        IMessageEncryptionService encryptionService,
        IMapper mapper,
        IHubContext<NotificationHub> hubContext,
        INotificationService notificationService,
        ILogger<UserMessageService> logger)
    {
        _messageRepo = messageRepo;
        _userRepo = userRepo;
        _encryptionService = encryptionService;
        _mapper = mapper;
        _hubContext = hubContext;
        _notificationService = notificationService;
        _logger = logger;
    }

    public async Task<List<ConversationDto>> GetConversationsAsync(int currentUserId)
    {
        var latestMessages = await _messageRepo.GetLatestMessagesForConversationsAsync(currentUserId);
        var result = new List<ConversationDto>();

        foreach (var msg in latestMessages)
        {
            var partner = msg.SenderId == currentUserId ? msg.Receiver : msg.Sender;
            if (partner == null) continue;

            string previewText;
            if (msg.IsDeleted)
            {
                previewText = "This message was deleted";
            }
            else
            {
                string decryptedContent;
                try
                {
                    decryptedContent = _encryptionService.Decrypt(msg.CipherText, msg.Nonce, msg.AuthTag, msg.KeyVersion);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to decrypt message {MessageId} preview", msg.MessageId);
                    decryptedContent = "[Encrypted Message]";
                }

                previewText = !string.IsNullOrWhiteSpace(decryptedContent)
                    ? decryptedContent
                    : (!string.IsNullOrWhiteSpace(msg.AttachmentsJson) ? "📎 Attachment" : string.Empty);
            }

            var unreadCount = await _messageRepo.GetUnreadCountFromSenderAsync(currentUserId, partner.UserId);
            var isConnected = await _messageRepo.AreUsersConnectedAsync(currentUserId, partner.UserId);

            var epoch = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            var timestampMs = (long)(msg.CreatedDate.ToUniversalTime() - epoch).TotalMilliseconds;

            result.Add(new ConversationDto
            {
                PartnerId = partner.UserId,
                PartnerName = partner.FullName,
                PartnerEmployeeId = partner.EmployeeId,
                PartnerDesignation = partner.Designation,
                PartnerDepartment = partner.Department?.Name ?? partner.Location,
                PartnerAvatarUrl = partner.ProfilePhotoUrl,
                LastMessage = previewText,
                LastMessageTime = msg.CreatedDate.ToLocalTime().ToString("hh:mm tt"),
                LastMessageTimestamp = timestampMs,
                UnreadCount = unreadCount,
                IsConnected = isConnected
            });
        }

        return result;
    }

    public async Task<List<UserMessageDto>> GetHistoryAsync(int currentUserId, int otherUserId, int pageNumber, int pageSize)
    {
        var messages = await _messageRepo.GetConversationHistoryAsync(currentUserId, otherUserId, pageNumber, pageSize);
        var dtos = new List<UserMessageDto>();

        foreach (var msg in messages)
        {
            var dto = new UserMessageDto
            {
                MessageId = msg.MessageId,
                SenderId = msg.SenderId,
                SenderName = msg.Sender?.FullName ?? string.Empty,
                SenderAvatarUrl = msg.Sender?.ProfilePhotoUrl,
                ReceiverId = msg.ReceiverId,
                ReceiverName = msg.Receiver?.FullName ?? string.Empty,
                ReceiverAvatarUrl = msg.Receiver?.ProfilePhotoUrl,
                AttachmentsJson = msg.AttachmentsJson,
                IsRead = msg.IsRead,
                ReadDate = msg.ReadDate,
                CreatedDate = msg.CreatedDate,
                ParentMessageId = msg.ParentMessageId,
                IsEdited = msg.IsEdited,
                EditedDate = msg.EditedDate,
                IsDeleted = msg.IsDeleted,
                Reactions = new List<MessageReactionDto>()
            };

            if (msg.IsDeleted)
            {
                dto.Content = "This message was deleted";
                dto.AttachmentsJson = null;
            }
            else
            {
                try
                {
                    dto.Content = _encryptionService.Decrypt(msg.CipherText, msg.Nonce, msg.AuthTag, msg.KeyVersion);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to decrypt message {MessageId}", msg.MessageId);
                    dto.Content = "[Encrypted Content]";
                }
            }

            // Resolve Parent Message context
            if (msg.ParentMessage != null)
            {
                dto.ParentSenderName = msg.ParentMessage.Sender?.FullName ?? "Colleague";
                if (msg.ParentMessage.IsDeleted)
                {
                    dto.ParentContent = "This message was deleted";
                }
                else
                {
                    try
                    {
                        var parentText = _encryptionService.Decrypt(
                            msg.ParentMessage.CipherText,
                            msg.ParentMessage.Nonce,
                            msg.ParentMessage.AuthTag,
                            msg.ParentMessage.KeyVersion);
                        dto.ParentContent = !string.IsNullOrWhiteSpace(parentText) ? parentText : "Attachment";
                    }
                    catch
                    {
                        dto.ParentContent = "[Encrypted Message]";
                    }
                }
            }

            // Group reactions
            if (msg.Reactions != null && msg.Reactions.Count > 0)
            {
                dto.Reactions = msg.Reactions
                    .GroupBy(r => r.ReactionType)
                    .Select(g => new MessageReactionDto
                    {
                        ReactionType = g.Key,
                        Count = g.Count(),
                        UserIds = g.Select(r => r.UserId).ToList(),
                        HasReacted = g.Any(r => r.UserId == currentUserId)
                    })
                    .ToList();
            }

            dtos.Add(dto);
        }

        return dtos;
    }

    public async Task<UserMessageDto> SendMessageAsync(int currentUserId, SendMessageDto dto)
    {
        if (dto.ReceiverId <= 0)
        {
            throw new BadRequestException("Invalid recipient user ID.");
        }

        if (dto.ReceiverId == currentUserId)
        {
            throw new BadRequestException("Cannot send message to yourself.");
        }

        var receiver = await _userRepo.GetByIdAsync(dto.ReceiverId);
        if (receiver == null || !receiver.IsActive || receiver.IsPermanentlySuspended)
        {
            throw new BadRequestException("Recipient colleague was not found or is currently inactive.");
        }

        var sender = await _userRepo.GetByIdAsync(currentUserId);
        if (sender == null)
        {
            throw new UnauthorizedException("Sender user not found.");
        }

        var trimmedText = (dto.Content ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(trimmedText) && string.IsNullOrEmpty(dto.AttachmentsJson))
        {
            throw new BadRequestException("Message content or attachment is required.");
        }

        // Validate parent message if replying
        long? validParentMessageId = null;
        string? parentPreviewContent = null;
        string? parentSenderName = null;

        if (dto.ParentMessageId.HasValue && dto.ParentMessageId.Value > 0)
        {
            var parent = await _messageRepo.GetByIdAsync(dto.ParentMessageId.Value);
            if (parent != null &&
                ((parent.SenderId == currentUserId && parent.ReceiverId == dto.ReceiverId) ||
                 (parent.SenderId == dto.ReceiverId && parent.ReceiverId == currentUserId)))
            {
                validParentMessageId = parent.MessageId;
                parentSenderName = parent.Sender?.FullName ?? "Colleague";
                if (parent.IsDeleted)
                {
                    parentPreviewContent = "This message was deleted";
                }
                else
                {
                    try
                    {
                        var pText = _encryptionService.Decrypt(parent.CipherText, parent.Nonce, parent.AuthTag, parent.KeyVersion);
                        parentPreviewContent = !string.IsNullOrWhiteSpace(pText) ? pText : "Attachment";
                    }
                    catch
                    {
                        parentPreviewContent = "[Encrypted Message]";
                    }
                }
            }
        }

        // Encrypt the message text via AES-256-GCM
        var (cipherText, nonce, authTag, keyVersion) = _encryptionService.Encrypt(trimmedText);

        var now = DateTime.UtcNow;
        var message = new UserMessage
        {
            SenderId = currentUserId,
            ReceiverId = dto.ReceiverId,
            CipherText = cipherText,
            Nonce = nonce,
            AuthTag = authTag,
            KeyVersion = keyVersion,
            AttachmentsJson = dto.AttachmentsJson,
            ParentMessageId = validParentMessageId,
            IsRead = false,
            CreatedDate = now,
            UpdatedDate = now
        };

        var saved = await _messageRepo.AddMessageAsync(message);

        // Fetch full entity with navigation properties for return
        var fullMessage = await _messageRepo.GetByIdWithDetailsAsync(saved.MessageId) ?? saved;
        var resultDto = _mapper.Map<UserMessageDto>(fullMessage);
        resultDto.Content = trimmedText;
        resultDto.ParentMessageId = validParentMessageId;
        resultDto.ParentContent = parentPreviewContent;
        resultDto.ParentSenderName = parentSenderName;
        resultDto.IsEdited = false;
        resultDto.IsDeleted = false;
        resultDto.Reactions = new List<MessageReactionDto>();

        // Broadcast real-time SignalR event to both receiver and sender
        try
        {
            await _hubContext.Clients.Group($"User_{dto.ReceiverId}").SendAsync("ReceiveDirectMessage", resultDto);
            await _hubContext.Clients.Group($"User_{currentUserId}").SendAsync("ReceiveDirectMessage", resultDto);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast ReceiveDirectMessage SignalR event for message {MessageId}", saved.MessageId);
        }

        // Publish in-app Knome notification
        try
        {
            await _notificationService.PublishAsync(
                dto.ReceiverId,
                "Message",
                $"{sender.FullName} sent you a message",
                "Message",
                currentUserId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to publish message notification to user {ReceiverId}", dto.ReceiverId);
        }

        return resultDto;
    }

    public async Task<UserMessageDto> EditMessageAsync(long messageId, int currentUserId, string newContent)
    {
        var message = await _messageRepo.GetByIdWithDetailsAsync(messageId);
        if (message == null)
        {
            throw new NotFoundException("Message not found.");
        }

        if (message.SenderId != currentUserId)
        {
            throw new ForbiddenException("You can only edit your own messages.");
        }

        if (message.IsDeleted)
        {
            throw new BadRequestException("Cannot edit a deleted message.");
        }

        // Enforce 15-minute edit window (WhatsApp style)
        var messageAge = DateTime.UtcNow - message.CreatedDate;
        if (messageAge.TotalMinutes > 15)
        {
            throw new BadRequestException("Messages can only be edited within 15 minutes of sending.");
        }

        var trimmedText = (newContent ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(trimmedText))
        {
            throw new BadRequestException("Message content cannot be empty.");
        }

        var (cipherText, nonce, authTag, keyVersion) = _encryptionService.Encrypt(trimmedText);

        message.CipherText = cipherText;
        message.Nonce = nonce;
        message.AuthTag = authTag;
        message.KeyVersion = keyVersion;
        message.IsEdited = true;
        message.EditedDate = DateTime.UtcNow;
        message.UpdatedDate = DateTime.UtcNow;

        await _messageRepo.UpdateAsync(message);

        var resultDto = _mapper.Map<UserMessageDto>(message);
        resultDto.Content = trimmedText;
        resultDto.IsEdited = true;
        resultDto.EditedDate = message.EditedDate;

        // Broadcast real-time SignalR event
        try
        {
            var editPayload = new
            {
                messageId = message.MessageId,
                content = trimmedText,
                isEdited = true,
                editedDate = message.EditedDate,
                partnerId = message.ReceiverId
            };
            await _hubContext.Clients.Group($"User_{message.ReceiverId}").SendAsync("MessageEdited", editPayload);
            await _hubContext.Clients.Group($"User_{currentUserId}").SendAsync("MessageEdited", editPayload);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast MessageEdited event for message {MessageId}", messageId);
        }

        return resultDto;
    }

    public async Task<bool> DeleteMessageAsync(long messageId, int currentUserId, bool deleteForEveryone = false)
    {
        var message = await _messageRepo.GetByIdAsync(messageId);
        if (message == null)
        {
            throw new NotFoundException("Message not found.");
        }

        if (message.SenderId != currentUserId && message.ReceiverId != currentUserId)
        {
            throw new ForbiddenException("You do not have permission to delete this message.");
        }

        if (deleteForEveryone)
        {
            // Only the sender can delete for everyone (WhatsApp functionality)
            if (message.SenderId != currentUserId)
            {
                throw new ForbiddenException("Only the sender can delete a message for everyone.");
            }

            message.IsDeleted = true;
            message.UpdatedDate = DateTime.UtcNow;
            await _messageRepo.UpdateAsync(message);

            // Broadcast real-time deletion event to both receiver and sender
            try
            {
                var delPayload = new
                {
                    messageId = message.MessageId,
                    partnerId = message.ReceiverId,
                    senderId = message.SenderId,
                    isDeleted = true,
                    deleteForEveryone = true
                };
                await _hubContext.Clients.Group($"User_{message.ReceiverId}").SendAsync("MessageDeleted", delPayload);
                await _hubContext.Clients.Group($"User_{currentUserId}").SendAsync("MessageDeleted", delPayload);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to broadcast MessageDeleted event for message {MessageId}", messageId);
            }

            return true;
        }
        else
        {
            // Delete for me
            if (message.SenderId == currentUserId)
            {
                message.IsDeletedBySender = true;
            }
            else if (message.ReceiverId == currentUserId)
            {
                message.IsDeletedByReceiver = true;
            }

            message.UpdatedDate = DateTime.UtcNow;
            await _messageRepo.UpdateAsync(message);

            // Broadcast to the deleting user's connections so their client removes the message
            try
            {
                var delPayload = new
                {
                    messageId = message.MessageId,
                    partnerId = message.SenderId == currentUserId ? message.ReceiverId : message.SenderId,
                    senderId = message.SenderId,
                    isDeleted = true,
                    deleteForEveryone = false
                };
                await _hubContext.Clients.Group($"User_{currentUserId}").SendAsync("MessageDeleted", delPayload);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to broadcast MessageDeleted event for message {MessageId}", messageId);
            }

            return true;
        }
    }

    public async Task<List<MessageReactionDto>> ToggleReactionAsync(long messageId, int currentUserId, string reactionType)
    {
        var message = await _messageRepo.GetByIdAsync(messageId);
        if (message == null)
        {
            throw new NotFoundException("Message not found.");
        }

        if (message.SenderId != currentUserId && message.ReceiverId != currentUserId)
        {
            throw new ForbiddenException("You can only react to messages in your own conversations.");
        }

        if (message.IsDeleted)
        {
            throw new BadRequestException("Cannot react to a deleted message.");
        }

        var normalizedType = (reactionType ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(normalizedType))
        {
            throw new BadRequestException("Reaction type is required.");
        }

        var existing = await _messageRepo.GetReactionAsync(messageId, currentUserId, normalizedType);
        if (existing != null)
        {
            await _messageRepo.RemoveReactionAsync(existing);
        }
        else
        {
            var newReaction = new UserMessageReaction
            {
                MessageId = messageId,
                UserId = currentUserId,
                ReactionType = normalizedType,
                CreatedDate = DateTime.UtcNow
            };
            await _messageRepo.AddReactionAsync(newReaction);
        }

        var allReactions = await _messageRepo.GetReactionsForMessageAsync(messageId);
        var grouped = allReactions
            .GroupBy(r => r.ReactionType)
            .Select(g => new MessageReactionDto
            {
                ReactionType = g.Key,
                Count = g.Count(),
                UserIds = g.Select(r => r.UserId).ToList(),
                HasReacted = g.Any(r => r.UserId == currentUserId)
            })
            .ToList();

        // Broadcast real-time reaction event
        try
        {
            var reactionPayload = new
            {
                messageId = message.MessageId,
                reactions = grouped,
                partnerId = currentUserId == message.SenderId ? message.ReceiverId : message.SenderId
            };
            await _hubContext.Clients.Group($"User_{message.ReceiverId}").SendAsync("MessageReactionUpdated", reactionPayload);
            await _hubContext.Clients.Group($"User_{message.SenderId}").SendAsync("MessageReactionUpdated", reactionPayload);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast MessageReactionUpdated event for message {MessageId}", messageId);
        }

        return grouped;
    }

    public async Task<bool> MarkConversationAsReadAsync(int currentUserId, int otherUserId)
    {
        await _messageRepo.MarkMessagesAsReadAsync(currentUserId, otherUserId);

        // Broadcast read receipt to other user
        try
        {
            await _hubContext.Clients.Group($"User_{otherUserId}").SendAsync("MessagesRead", new
            {
                partnerId = currentUserId,
                readDate = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast MessagesRead event for user {OtherUserId}", otherUserId);
        }

        return true;
    }

    public async Task<List<MessageUserSearchDto>> SearchUsersAsync(string query, int currentUserId)
    {
        var users = await _messageRepo.SearchUsersForMessagingAsync(query, currentUserId, 25);
        var results = new List<MessageUserSearchDto>();

        foreach (var u in users)
        {
            var isOnline = NotificationHub.IsUserOnline(u.UserId);
            var isConnected = await _messageRepo.AreUsersConnectedAsync(currentUserId, u.UserId);

            results.Add(new MessageUserSearchDto
            {
                UserId = u.UserId,
                FullName = u.FullName,
                EmployeeId = u.EmployeeId,
                Email = u.Email,
                Designation = u.Designation,
                Department = u.Department?.Name ?? u.Location,
                AvatarUrl = u.ProfilePhotoUrl,
                IsOnline = isOnline,
                IsConnected = isConnected
            });
        }

        return results;
    }
}
