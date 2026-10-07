import { apiClient } from './apiClient';
import { resolveMediaUrl, formatToDDMMYYYY } from './apiService';

const DEFAULT_COVER_IMAGES = [
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1200',
    'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&q=80&w=1200',
    'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200',
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200',
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=1200'
];

export function mapArticle(art) {
    if (!art) return null;
    const coverAttachmentRaw = art.coverImageUrl 
        || art.attachmentUrls?.find(url => url && url.match(/\.(jpeg|jpg|gif|png|webp)$/i))
        || art.attachments?.find(a => a && (a.fileType === 'Image' || (a.fileUrl && a.fileUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i))))?.fileUrl;

    const coverImage = coverAttachmentRaw 
        ? resolveMediaUrl(coverAttachmentRaw) 
        : (art.coverImageUrl ? resolveMediaUrl(art.coverImageUrl) : null);

    const rawAttachments = (art.attachments && art.attachments.length > 0)
        ? art.attachments.map(att => {
            const fileUrl = (att.fileUrl || '').toLowerCase();
            const isAudio = Boolean(fileUrl.match(/\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i) || att.fileType === 'Audio');
            const isDoc = !isAudio && Boolean(fileUrl.match(/\.(pdf|docx|doc|txt|xls|xlsx|ppt|pptx)(\?.*)?$/i) || att.fileType === 'Document');
            const isImage = !isAudio && !isDoc && Boolean(fileUrl.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)(\?.*)?$/i) || att.fileType === 'Image');
            const isVideo = !isAudio && !isDoc && !isImage && Boolean(fileUrl.match(/\.(mp4|webm|mov|m4v|mkv)$/i) || att.fileType === 'Video' || fileUrl.includes('/uploads/videos/'));

            return {
                url: resolveMediaUrl(att.fileUrl),
                rawUrl: att.fileUrl,
                name: att.fileName || att.fileUrl.split('/').pop() || 'Attached File',
                fileType: isAudio ? 'Audio' : (att.fileType || (isDoc ? 'Document' : isImage ? 'Image' : isVideo ? 'Video' : 'File')),
                publishedDate: att.publishedDate || art.publishedDate,
                isAudio,
                isDoc,
                isImage,
                isVideo,
            };
          })
        : (art.attachmentUrls || []).map(url => {
            const rawUrl = (url || '').toLowerCase();
            const isAudio = Boolean(rawUrl.match(/\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i));
            const isDoc = !isAudio && Boolean(rawUrl.match(/\.(pdf|docx|doc|txt|xls|xlsx|ppt|pptx)(\?.*)?$/i));
            const isImage = !isAudio && !isDoc && Boolean(rawUrl.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)(\?.*)?$/i));
            const isVideo = !isAudio && !isDoc && !isImage && Boolean(rawUrl.match(/\.(mp4|webm|mov|m4v|mkv)$/i) || rawUrl.includes('/uploads/videos/'));

            return {
                url: resolveMediaUrl(url),
                rawUrl: url,
                name: url.split('/').pop() || 'Attached File',
                publishedDate: art.publishedDate || art.createdDate,
                fileType: isAudio ? 'Audio' : (isDoc ? 'Document' : (isImage ? 'Image' : (isVideo ? 'Video' : 'File'))),
                isAudio,
                isDoc,
                isImage,
                isVideo,
            };
          });

    // Filter out cover photo from attachments so image is shown only ONCE
    const attachmentsList = rawAttachments.filter(att => {
        if (att.isImage && coverAttachmentRaw) {
            if (att.rawUrl === coverAttachmentRaw || (att.url && coverImage && att.url === coverImage)) {
                return false;
            }
        }
        return true;
    });

    const authorName = art.authorFullName || 'Enterprise Author';
    const authorAvatar = art.authorProfilePhotoUrl 
        ? resolveMediaUrl(art.authorProfilePhotoUrl) 
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=6366f1&color=fff&size=256&bold=true`;

    const isScheduledFuture = art.status === 'Scheduled' && art.scheduledDate && new Date(art.scheduledDate).getTime() > Date.now();
    const displayDate = isScheduledFuture
        ? `Scheduled for ${formatToDDMMYYYY(art.scheduledDate)}`
        : formatToDDMMYYYY(art.publishedDate || art.scheduledDate || art.createdDate);

    return {
        id: (art.articleId ?? art.id).toString(),
        articleId: art.articleId ?? art.id,
        title: art.title,
        subtitle: art.description || 'No summary provided',
        description: art.description,
        status: art.status || 'Published',
        scheduledDate: art.scheduledDate || null,
        publishedDate: art.publishedDate || null,
        createdDate: art.createdDate || null,
        isScheduledFuture: isScheduledFuture,
        authorUserId: art.authorUserId,
        author: {
            id: art.authorUserId,
            name: authorName,
            role: art.authorDesignation || 'Writer',
            avatar: authorAvatar
        },
        date: displayDate,
        formattedDate: formatToDDMMYYYY(art.publishedDate || art.scheduledDate || art.createdDate),
        readTime: `${art.avgReadTimeSeconds > 0 ? Math.ceil(art.avgReadTimeSeconds / 60) : 5} min read`,
        category: art.categoryName || 'General',
        categoryId: art.categoryId,
        tags: art.tags || [],
        image: coverImage,
        attachments: attachmentsList,
        likes: art.engagementSummary?.reactionSummary?.totalCount ?? art.engagementSummary?.reactionSummary?.likeCount ?? art.engagementSummary?.likesCount ?? 0,
        reactions: art.engagementSummary?.reactionSummary?.totalCount ?? art.engagementSummary?.reactionSummary?.likeCount ?? 0,
        views: art.viewCount || 0,
        shares: art.engagementSummary?.sharesCount || 0,
        isBookmarked: art.engagementSummary?.isBookmarkedByCurrentUser || false,
        commentsCount: art.engagementSummary?.commentsCount || 0,
        community: 'General',
        members: '0 members',
        communityDesc: '',
        communityIcon: 'architecture',
        content: [
            { type: 'paragraph', text: art.contentHtml || 'No content provided.' }
        ],
        rawHtml: art.contentHtml,
        comments: []
    };
}

export async function getArticles(categoryId = null, tag = null, search = null, pageNumber = 1, pageSize = 20, forceFresh = false) {
    try {
        let endpoint = `/Articles?pageNumber=${pageNumber}&pageSize=${pageSize}`;
        if (categoryId) endpoint += `&categoryId=${categoryId}`;
        if (tag) endpoint += `&tag=${encodeURIComponent(tag)}`;
        if (search) endpoint += `&search=${encodeURIComponent(search)}`;

        const data = await apiClient.get(endpoint, forceFresh ? { noCache: true } : {});
        return (data || []).map(art => mapArticle(art));
    } catch (error) {
        console.error('Failed to fetch articles', error);
        return [];
    }
}

export async function getArticleById(id) {
    try {
        const data = await apiClient.get(`/Articles/${id}`);
        return mapArticle(data?.data || data);
    } catch (error) {
        console.error('Failed to get article by id', error);
        return null;
    }
}

export async function recordArticleView(id) {
    try {
        const res = await apiClient.post(`/Articles/${id}/view`);
        const newCount = res?.data ?? res;
        // Dispatch live event so any active article lists / profiles update in real time
        window.dispatchEvent(new CustomEvent('knome_article_viewed', { detail: { id: Number(id), viewCount: newCount } }));
        return newCount;
    } catch (error) {
        console.warn('Failed to record article view', error);
        return null;
    }
}

export async function saveArticle(articleDto) {
    try {
        const response = await apiClient.post('/Articles', articleDto);
        return response;
    } catch (error) {
        console.error('Failed to save article', error);
        throw error;
    }
}

export async function updateArticle(articleId, articleDto) {
    try {
        const response = await apiClient.put(`/Articles/${articleId}`, articleDto);
        return response;
    } catch (error) {
        console.error('Failed to update article', error);
        throw error;
    }
}

export async function publishScheduledArticleNow(article) {
    const updateDto = {
        title: article.title,
        description: article.subtitle || article.description || null,
        contentHtml: article.rawHtml || `<p>${article.title}</p>`,
        categoryId: article.categoryId || 7,
        status: "Published",
        scheduledDate: null,
        tags: article.tags || [],
        attachmentUrls: (article.attachments || []).map(a => a.rawUrl || a.url).filter(Boolean)
    };
    return await updateArticle(article.id || article.articleId, updateDto);
}

export async function deleteArticle(articleId) {
    try {
        const response = await apiClient.delete(`/Articles/${articleId}`);
        return response;
    } catch (error) {
        console.error('Failed to delete article', error);
        throw error;
    }
}

export async function getArticleCategories() {
    try {
        const response = await apiClient.get('/Articles/categories');
        return Array.isArray(response) ? response : (response?.data || []);
    } catch (error) {
        console.error('Failed to fetch article categories', error);
        return [];
    }
}

export async function createArticleCategory(name) {
    try {
        const response = await apiClient.post('/Articles/categories', { name });
        return response;
    } catch (error) {
        console.error('Failed to create article category', error);
        throw error;
    }
}



