import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../components/contexts/UserContext';
import { useToast } from '../components/contexts/ToastContext';
import { useConfirm } from '../components/contexts/ConfirmDialogContext';
import { getArticles, deleteArticle, recordArticleView } from '../utils/articleService';
import { resolveMediaUrl, interactionsApi } from '../utils/apiService';
import { checkRestrictedContent } from '../utils/restrictedWords';
import ReportModal from '../components/modals/ReportModal';
import SaveToCategoryModal from '../components/modals/SaveToCategoryModal';
import ArticleShareModal from '../components/modals/ArticleShareModal';
import DocumentViewerModal from '../components/modals/DocumentViewerModal';
import ReactionsModal from '../components/modals/ReactionsModal';

const REACTION_TYPES = {
    like: { icon: '👍', label: 'Like', color: 'text-blue-500' },
    celebrate: { icon: '🎉', label: 'Celebrate', color: 'text-amber-500' },
    support: { icon: '🤝', label: 'Support', color: 'text-purple-500' },
    heart: { icon: '❤️', label: 'Heart', color: 'text-pink-500' }
};

export default function ArticleView() {
    const location = useLocation();
    const navigate = useNavigate();
    const { currentUser } = useUser();
    const { addToast } = useToast();
    const confirm = useConfirm();

    const [isReportOpen, setIsReportOpen] = useState(false);
    const [savingArticleModal, setSavingArticleModal] = useState(null);
    const [sharingArticleModal, setSharingArticleModal] = useState(null);
    const [activeDocViewer, setActiveDocViewer] = useState(null);
    
    // Read ?id=X query parameter
    const searchParams = new URLSearchParams(location.search);
    const articleId = searchParams.get('id');
    
    // Local state for fetched articles
    const [articles, setArticles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    
    useEffect(() => {
        const fetchArticles = async () => {
            const data = await getArticles();
            setArticles(data || []);
            setIsLoading(false);
        };
        fetchArticles();

        // Strict DRM & Anti-Save/Print Blocker
        const preventSaveAndPrint = (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P' || e.key === 's' || e.key === 'S' || e.key === 'u' || e.key === 'U')) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        };
        const disableDocContextMenu = (e) => {
            const t = e.target;
            if (t && (
                t.closest?.('.article-body') ||
                t.closest?.('[id^="doc-viewer"]') ||
                t.closest?.('object') ||
                t.closest?.('iframe') ||
                t.tagName === 'OBJECT' ||
                t.tagName === 'IFRAME' ||
                t.tagName === 'EMBED' ||
                t.tagName === 'IMG' ||
                t.tagName === 'VIDEO'
            )) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        };

        window.addEventListener('keydown', preventSaveAndPrint, true);
        window.addEventListener('contextmenu', disableDocContextMenu, true);
        document.addEventListener('contextmenu', disableDocContextMenu, true);

        return () => {
            window.removeEventListener('keydown', preventSaveAndPrint, true);
            window.removeEventListener('contextmenu', disableDocContextMenu, true);
            document.removeEventListener('contextmenu', disableDocContextMenu, true);
        };
    }, []);
    
    // Find current article or fallback
    const article = articles.find(art => art.id === articleId) || articles.find(art => art.id === '1') || articles[0];

    const isSystemAdminOrAuthor = ['SYSADM', 'HRADM', 'SYSTEM ADMIN', 'HR ADMIN'].includes(String(currentUser?.role || '').toUpperCase()) || 
                                  ['System Administrator', 'HR Administrator', 'System Admin', 'HR Admin'].includes(currentUser?.roleName) || 
                                  (Array.isArray(currentUser?.roles) && currentUser.roles.some(r => ['SYSADM', 'HRADM', 'System Administrator', 'HR Administrator', 'System Admin', 'HR Admin'].includes(r))) ||
                                  article?.author?.name === currentUser?.fullName;

    const handleDeleteArticle = async () => {
        if (!article?.id) return;
        const ok = await confirm({
            title: 'Delete Article',
            message: 'Are you sure you want to delete this article? This action cannot be undone.',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            variant: 'danger'
        });
        if (!ok) return;
        try {
            await deleteArticle(article.id);
            addToast('Article deleted successfully.', 'success');
            navigate('/articles');
        } catch (err) {
            addToast('Failed to delete article.', 'error');
        }
    };
    
    // Local interactive states for the selected article
    const [likes, setLikes] = useState(0);
    const [userLiked, setUserLiked] = useState(false);
    const [views, setViews] = useState(0);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');

    const loadArticleComments = async (artId) => {
        if (!artId) return;
        try {
            const localKey = `knome_article_comments_${artId}`;
            const storedLocal = JSON.parse(localStorage.getItem(localKey) || '[]');

            const apiRes = await interactionsApi.getComments('Article', artId).catch(() => null);
            const apiComments = Array.isArray(apiRes) ? apiRes : (apiRes?.data || []);

            const mappedApi = apiComments.map(c => ({
                id: c.commentId || c.id,
                author: c.authorFullName || c.author?.name || c.author || 'User',
                avatar: c.authorProfilePhotoUrl ? resolveMediaUrl(c.authorProfilePhotoUrl) : (c.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.authorFullName || 'User')}&background=6366f1&color=fff`),
                time: c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : (c.time || 'Recently'),
                text: c.commentText || c.text || '',
                likesCount: c.likesCount || 0,
                isLiked: Boolean(c.isLiked),
                replies: (c.replies || []).map(r => ({
                    id: r.commentId || r.id,
                    author: r.authorFullName || r.author?.name || r.author || 'User',
                    avatar: r.authorProfilePhotoUrl ? resolveMediaUrl(r.authorProfilePhotoUrl) : (r.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(r.authorFullName || 'User')}&background=6366f1&color=fff`),
                    time: r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : (r.time || 'Recently'),
                    text: r.commentText || r.text || '',
                    likesCount: r.likesCount || 0,
                    isLiked: Boolean(r.isLiked),
                    replies: []
                }))
            }));

            // Merge API and local comments by ID
            const mergedMap = new Map();
            [...mappedApi, ...storedLocal].forEach(c => {
                if (c && c.id) mergedMap.set(c.id, c);
            });

            const finalComments = Array.from(mergedMap.values()).sort((a, b) => b.id - a.id);
            setComments(finalComments);
        } catch (err) {
            console.error('Failed to load article comments:', err);
        }
    };
    
    // Update state when articleId changes or article loads
    useEffect(() => {
        if (article) {
            setLikes(Number(article.likes || article.reactionsCount || 0));
            setUserLiked(false);
            setNewComment('');
            setViews(Number(article.views || 0));

            // Record article view in backend (strictly 1 unique view per user)
            recordArticleView(article.id).then(res => {
                const count = (typeof res === 'number') ? res : (res?.viewCount ?? res?.data?.viewCount ?? res?.data);
                if (typeof count === 'number') {
                    setViews(count);
                }
            }).catch(() => {});
            
            // Fetch live reaction status from backend API
            const cachedArticle = (() => {
                try {
                    const raw = localStorage.getItem(`knome_article_interaction_${article.id}`);
                    return raw ? JSON.parse(raw) : null;
                } catch { return null; }
            })();

            if (cachedArticle) {
                if (typeof cachedArticle.likes === 'number') setLikes(cachedArticle.likes);
                if (typeof cachedArticle.liked === 'boolean') setUserLiked(cachedArticle.liked);
            }

            interactionsApi.getSummary('Article', article.id).then(summary => {
                if (summary) {
                    const totalLikes = Number(
                        summary.reactionSummary?.totalCount ?? 
                        summary.reactionSummary?.likeCount ?? 
                        summary.totalCount ?? 
                        summary.reactionsCount ?? 
                        summary.totalLikes ?? 
                        Number(article.likes || 0)
                    );
                    const isLiked = Boolean(
                        summary.reactionSummary?.currentUserReactionType || 
                        summary.userReaction || 
                        summary.hasReacted || 
                        summary.isLiked
                    );
                    const finalLikes = cachedArticle?.likes != null ? Math.max(cachedArticle.likes, totalLikes) : totalLikes;
                    const finalLiked = cachedArticle?.liked !== undefined ? cachedArticle.liked : isLiked;
                    setLikes(finalLikes);
                    setUserLiked(finalLiked);
                }
            }).catch(() => {});

            // Scroll to top of page when changing articles
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Load persistent comments from API & LocalStorage
            loadArticleComments(article.id);
        }
    }, [article?.id]);

    const handleLike = async () => {
        if (!article?.id) return;
        const nextLiked = !userLiked;
        const newLikes = nextLiked ? likes + 1 : Math.max(0, likes - 1);
        setUserLiked(nextLiked);
        setLikes(newLikes);

        try {
            localStorage.setItem(`knome_article_interaction_${article.id}`, JSON.stringify({
                liked: nextLiked,
                likes: newLikes
            }));
        } catch (_) {}

        try {
            await interactionsApi.toggleReaction('Article', article.id, 'Like');
        } catch (err) {
            console.warn('Article reaction notice:', err);
        }
    };

    const handleAddComment = async (e) => {
        e.preventDefault();
        if (!newComment.trim() || !article?.id) return;
        
        const commentText = newComment.trim();
        const foundKeyword = checkRestrictedContent(commentText);
        if (foundKeyword) {
            addToast(`Security Alert: Please don't use this restricted or abusive word - "${foundKeyword}". Comment cannot be posted.`, 'warning');
            return;
        }

        const authorName = currentUser?.fullName || currentUser?.name || 'You';
        const authorAvatar = currentUser?.profilePhotoUrl ? resolveMediaUrl(currentUser.profilePhotoUrl) : `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=6366f1&color=fff`;

        const newC = {
            id: Date.now(),
            author: authorName,
            avatar: authorAvatar,
            time: 'Just now',
            text: commentText,
            replies: []
        };
        
        // Optimistic UI update
        setComments(prev => [newC, ...prev]);
        setNewComment('');

        // Save to localStorage for instant local multi-session persistence
        try {
            const localKey = `knome_article_comments_${article.id}`;
            const storedLocal = JSON.parse(localStorage.getItem(localKey) || '[]');
            localStorage.setItem(localKey, JSON.stringify([newC, ...storedLocal]));
        } catch (err) {}

        // Save to backend database API so other users/devices see it!
        try {
            await interactionsApi.addComment('Article', article.id, commentText);
        } catch (err) {
            console.warn('Backend comment push failed (local comment preserved):', err);
        }
    };

    const addReplyToTree = (commentList, parentId, newReply) => {
        return (commentList || []).map(c => {
            if (c.id === parentId) {
                return { ...c, replies: [...(c.replies || []), newReply] };
            }
            if (c.replies && c.replies.length > 0) {
                return { ...c, replies: addReplyToTree(c.replies, parentId, newReply) };
            }
            return c;
        });
    };

    const handleReplyComment = async (parentCommentId, replyText) => {
        if (!replyText || !replyText.trim() || !article?.id) return;

        const trimmedReply = replyText.trim();
        const foundKeyword = checkRestrictedContent(trimmedReply);
        if (foundKeyword) {
            addToast(`Security Alert: Please don't use this restricted or abusive word - "${foundKeyword}". Reply cannot be posted.`, 'warning');
            return;
        }

        const authorName = currentUser?.fullName || currentUser?.name || 'You';
        const authorAvatar = currentUser?.profilePhotoUrl ? resolveMediaUrl(currentUser.profilePhotoUrl) : `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=6366f1&color=fff`;

        const newReply = {
            id: Date.now(),
            author: authorName,
            avatar: authorAvatar,
            time: 'Just now',
            text: trimmedReply,
            replies: []
        };

        setComments(prev => addReplyToTree(prev, parentCommentId, newReply));

        try {
            const localKey = `knome_article_comments_${article.id}`;
            const storedLocal = JSON.parse(localStorage.getItem(localKey) || '[]');
            const updatedLocal = addReplyToTree(storedLocal, parentCommentId, newReply);
            localStorage.setItem(localKey, JSON.stringify(updatedLocal));
        } catch (err) {}

        try {
            await interactionsApi.addComment('Article', article.id, trimmedReply, parentCommentId);
        } catch (err) {}
    };

    if (isLoading) {
        return (
            <main className="flex-1 bg-white dark:bg-slate-900 min-h-full px-4 md:px-12 py-12 max-w-[800px] mx-auto border-x border-slate-200 dark:border-slate-800 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                    <span className="material-symbols-outlined text-blue-500 text-4xl animate-spin">refresh</span>
                    <p className="text-slate-500 font-bold">Loading article...</p>
                </div>
            </main>
        );
    }

    if (!article) {
        return (
            <main className="flex-1 bg-white dark:bg-slate-900 min-h-full px-4 md:px-12 py-12 max-w-[800px] mx-auto border-x border-slate-200 dark:border-slate-800 flex items-center justify-center">
                <p className="text-slate-500 font-bold">Article not found.</p>
            </main>
        );
    }

    // Related content excludes the current article
    const relatedArticles = articles.filter(art => art.id !== article.id).slice(0, 3);
    
    // Calculate total comments
    const totalComments = comments.length + comments.reduce((acc, c) => acc + (c.replies?.length || 0), 0);

    const cleanAndFormatArticleContent = (htmlOrText) => {
        if (!htmlOrText) return '';
        let cleaned = typeof htmlOrText === 'string' ? htmlOrText : '';

        // 1. Remove residual placeholder text & fragments
        cleaned = cleaned.replace(/Start writing your long-form article here\.{0,3}/gi, '');
        cleaned = cleaned.replace(/Start writing your article here\.{0,3}/gi, '');
        cleaned = cleaned.replace(/Start writi(?:ng)?/gi, '');

        // 2. Remove unwanted opacity classes and editor selection markers
        cleaned = cleaned.replace(/class="[^"]*opacity-50[^"]*"/gi, '');
        cleaned = cleaned.replace(/class="[^"]*isSelectedEnd[^"]*"/gi, '');
        cleaned = cleaned.replace(/class="[^"]*PDq2pG_selectionAnchorContainer[^"]*"/gi, '');

        // 3. Remove weird data-path-to-node / data-index-in-node attributes
        cleaned = cleaned.replace(/\s*data-path-to-node="[^"]*"/gi, '');
        cleaned = cleaned.replace(/\s*data-index-in-node="[^"]*"/gi, '');

        // 4. Remove empty paragraphs
        cleaned = cleaned.replace(/<p[^>]*>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, '');

        // If it's plain text without HTML tags, wrap paragraphs
        if (!cleaned.includes('<p') && !cleaned.includes('<div') && !cleaned.includes('<h') && !cleaned.includes('<ul')) {
            return cleaned.split(/\n\n+/).map(p => `<p class="mb-4 leading-relaxed">${p.replace(/\n/g, '<br/>')}</p>`).join('');
        }

        return cleaned.trim();
    };

    const rawArticleContent = article?.rawHtml || 
                              article?.contentHtml || 
                              (Array.isArray(article?.content) ? article.content.map(b => b.text || '').join('\n\n') : article?.content) || 
                              '';
    const formattedArticleHtml = cleanAndFormatArticleContent(rawArticleContent);

    // Show photo only ONCE: filter out any attachment image that matches the cover image & deduplicate
    const coverMediaUrl = article?.image ? resolveMediaUrl(article.image) : null;
    const displayAttachments = (article?.attachments || []).filter((file, idx, arr) => {
        const mediaUrl = resolveMediaUrl(file.url || file.rawUrl);
        const fileName = (file.name || file.url || file.rawUrl || '').toLowerCase();
        const isAudio = file.isAudio || 
                        file.fileType === 'Audio' || 
                        !!fileName.match(/\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i);
        const isDoc = !isAudio && (file.isDoc || file.fileType === 'Document' || !!fileName.match(/\.(pdf|docx|doc|txt|xls|xlsx|ppt|pptx)(\?.*)?$/i));
        const isImage = !isAudio && !isDoc && (file.isImage || file.fileType === 'Image' || !!fileName.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp)(\?.*)?$/i));

        // If it's an image and already displayed as the main Cover photo, don't show it again
        if (isImage && coverMediaUrl && (mediaUrl === coverMediaUrl || (file.rawUrl && coverMediaUrl.includes(file.rawUrl)))) {
            return false;
        }

        // Deduplicate
        const firstIndex = arr.findIndex(f => (f.url || f.rawUrl) === (file.url || file.rawUrl));
        return firstIndex === idx;
    });

    return (
        <>
            <main className="flex-1 bg-white dark:bg-slate-900 min-h-full px-4 sm:px-8 md:px-12 lg:px-20 py-10 w-full max-w-7xl mx-auto overflow-hidden">
                {/*  Metadata Header  */}
                <header className="mb-10">
                    <nav className="flex items-center justify-between mb-6 text-slate-500">
                        <div className="flex items-center gap-2">
                            <Link className="hover:text-blue-500 font-semibold text-xs" to="/articles">Articles</Link>
                            <span className="material-symbols-outlined text-sm">chevron_right</span>
                            <span className="text-xs font-semibold text-slate-400 dark:text-slate-600 truncate">{article.category}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {isSystemAdminOrAuthor && (
                                <button 
                                    onClick={handleDeleteArticle}
                                    className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors flex items-center gap-1 border border-rose-200 dark:border-rose-800/40"
                                >
                                    <span className="material-symbols-outlined text-sm">delete</span>
                                    Delete Article
                                </button>
                            )}
                            <button 
                                onClick={() => setSharingArticleModal(article)}
                                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-blue-500" 
                                title="Share Article"
                            >
                                <span className="material-symbols-outlined text-lg">share</span>
                            </button>
                            <button 
                                onClick={() => setIsReportOpen(true)}
                                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-rose-500" 
                                title="Report Article"
                            >
                                <span className="material-symbols-outlined text-lg">flag</span>
                            </button>
                        </div>
                    </nav>

                    <h1 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white leading-[1.15] mb-6">
                        {article.title}
                    </h1>

                    <div className="flex flex-wrap items-center justify-between gap-4 py-4 border-y border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                            <img 
                                className="w-11 h-11 rounded-full object-cover ring-2 ring-blue-500/20" 
                                alt={article.author.name} 
                                src={article.author.avatar} 
                            />
                            <div>
                                <h4 className="font-bold text-sm text-slate-900 dark:text-white">{article.author.name}</h4>
                                <p className="text-xs text-slate-500 font-medium">{article.author.role} • {article.date} • {article.readTime}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 rounded-full text-xs font-bold" title="Total Views">
                                <span className="material-symbols-outlined text-sm">visibility</span>
                                <span>{views.toLocaleString()} views</span>
                            </div>

                            <button 
                                onClick={handleLike}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                                    userLiked 
                                        ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40 shadow-sm' 
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: userLiked ? "'FILL' 1" : "'FILL' 0" }}>favorite</span>
                                <span>{likes}</span>
                            </button>

                            <button 
                                onClick={() => setSavingArticleModal({
                                    ...article,
                                    contentType: 'Article',
                                    title: article.title,
                                    text: article.subtitle || article.description || article.content || '',
                                    image: article.image
                                })}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full text-xs font-bold transition-colors"
                            >
                                <span className="material-symbols-outlined text-sm">bookmark</span>
                                <span>Save</span>
                            </button>
                        </div>
                    </div>
                </header>

                {/*  Cover Image  */}
                {article.image && (
                    <figure className="mb-12 rounded-2xl overflow-hidden shadow-lg border border-slate-200/60 dark:border-slate-800">
                        <img 
                            className="w-full max-h-[500px] object-cover" 
                            alt={article.title} 
                            src={resolveMediaUrl(article.image)} 
                        />
                        {article.subtitle && (
                            <figcaption className="p-4 text-center bg-slate-50 dark:bg-slate-800/40 text-xs md:text-sm text-slate-500 font-medium">
                                {article.subtitle}
                            </figcaption>
                        )}
                    </figure>
                )}

                {/*  Article Body  */}
                <article className="article-body text-slate-800 dark:text-slate-200 text-base md:text-lg leading-relaxed selection:bg-blue-500/10 space-y-6">
                    {formattedArticleHtml ? (
                        <div 
                            className="prose dark:prose-invert max-w-none text-slate-800 dark:text-slate-200 leading-relaxed font-normal
                                       prose-headings:text-slate-900 dark:prose-headings:text-white prose-headings:font-bold prose-headings:mt-10 prose-headings:mb-4
                                       prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl
                                       prose-p:mb-5 prose-p:leading-relaxed prose-p:text-base md:prose-p:text-lg
                                       prose-ul:list-disc prose-ul:pl-6 prose-ul:my-5 prose-ul:space-y-2
                                       prose-ol:list-decimal prose-ol:pl-6 prose-ol:my-5 prose-ol:space-y-2
                                       prose-li:text-slate-700 dark:prose-li:text-slate-300
                                       prose-strong:font-bold prose-strong:text-slate-900 dark:prose-strong:text-white
                                       prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:pl-5 prose-blockquote:italic prose-blockquote:my-8 prose-blockquote:bg-slate-50 dark:prose-blockquote:bg-slate-800/30 prose-blockquote:py-3 prose-blockquote:pr-5 prose-blockquote:rounded-r-xl"
                            dangerouslySetInnerHTML={{ __html: formattedArticleHtml }}
                        />
                    ) : (
                        article.content && article.content.map((block, idx) => {
                            if (block.type === 'heading') {
                                return (
                                    <h2 key={idx} className="font-bold text-xl md:text-2xl text-slate-900 dark:text-white mt-10 mb-4">
                                        {block.text}
                                    </h2>
                                );
                            } else if (block.type === 'blockquote') {
                                return (
                                    <blockquote key={idx} className="border-l-4 border-blue-500 pl-5 italic text-slate-500 my-8 bg-slate-50 dark:bg-slate-800/30 py-3 pr-5 rounded-r-xl">
                                        "{block.text}"
                                    </blockquote>
                                );
                            } else {
                                return (
                                    <p key={idx} className="mb-5 leading-relaxed text-base md:text-lg">
                                        {block.text}
                                    </p>
                                );
                            }
                        })
                    )}
                    
                    {/* Attached Documents & Media */}
                    {displayAttachments && displayAttachments.length > 0 && (
                        <div className="mt-10 mb-8 p-5 bg-slate-50/80 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800">
                            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-indigo-500 text-[20px]">attachment</span>
                                Attached Documents & Media ({displayAttachments.length})
                            </h3>
                            <div className="space-y-3.5">
                                {displayAttachments.map((file, idx) => {
                                    const fileName = (file.name || file.url || file.rawUrl || '').toLowerCase();
                                    const isAudio = file.isAudio || 
                                                    file.fileType === 'Audio' || 
                                                    !!fileName.match(/\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i);

                                    const isDoc = !isAudio && (
                                        file.isDoc || 
                                        file.fileType === 'Document' || 
                                        !!fileName.match(/\.(pdf|docx|doc|txt|xls|xlsx|ppt|pptx)(\?.*)?$/i)
                                    );

                                    const isImage = !isAudio && !isDoc && (
                                        file.isImage || 
                                        file.fileType === 'Image' || 
                                        !!fileName.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp)(\?.*)?$/i)
                                    );

                                    const isVideo = !isAudio && !isDoc && !isImage && (
                                        file.isVideo || 
                                        file.fileType === 'Video' || 
                                        !!fileName.match(/\.(mp4|webm|ogg|mov|m4v|mkv)(\?.*)?$/i)
                                    );

                                    const mediaUrl = resolveMediaUrl(file.url || file.rawUrl);

                                    if (isAudio) {
                                        return (
                                            <div key={idx} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 shadow-xs hover:border-violet-300 dark:hover:border-violet-800/50 transition-all">
                                                <div className="flex items-center gap-3 min-w-0 mb-2.5">
                                                    <div className="w-9 h-9 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                                                        <span className="material-symbols-outlined text-[20px]">
                                                            audiotrack
                                                        </span>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate" title={file.name}>
                                                            {file.name || 'Attached Audio'}
                                                        </p>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 uppercase tracking-wider">
                                                                Audio
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Native HTML5 Audio Player */}
                                                <div className="rounded-lg p-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60">
                                                    <audio
                                                        controls
                                                        controlsList="nodownload"
                                                        preload="metadata"
                                                        src={mediaUrl}
                                                        className="w-full h-8 accent-violet-600"
                                                    >
                                                        Your browser does not support HTML5 audio playback.
                                                    </audio>
                                                </div>
                                            </div>
                                        );
                                    }

                                    if (isImage) {
                                        return (
                                            <div key={idx} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-800/50 transition-all">
                                                <div className="flex items-center gap-3 min-w-0 mb-2.5">
                                                    <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                                                        <span className="material-symbols-outlined text-[20px]">image</span>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate" title={file.name}>
                                                            {file.name || 'Attached Photo'}
                                                        </p>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
                                                                Image
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Image Preview Container */}
                                                <div className="relative rounded-lg overflow-hidden bg-slate-950/5 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 flex items-center justify-center p-1">
                                                    <img
                                                        src={mediaUrl}
                                                        alt={file.name || 'Attached Image'}
                                                        className="max-h-[500px] w-auto max-w-full rounded-md object-contain shadow-xs"
                                                    />
                                                </div>
                                            </div>
                                        );
                                    }

                                    if (isVideo) {
                                        return (
                                            <div key={idx} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 shadow-xs hover:border-rose-300 dark:hover:border-rose-800/50 transition-all">
                                                <div className="flex items-center gap-3 min-w-0 mb-2.5">
                                                    <div className="w-9 h-9 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                                                        <span className="material-symbols-outlined text-[20px]">play_circle</span>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate" title={file.name}>
                                                            {file.name || 'Uploaded Video'}
                                                        </p>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 uppercase tracking-wider">
                                                                Video
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Native HTML5 Video Player */}
                                                <div className="relative rounded-lg overflow-hidden bg-slate-950 aspect-video max-h-[420px] w-full border border-slate-200 dark:border-slate-800 shadow-inner">
                                                    <video
                                                        controls
                                                        controlsList="nodownload"
                                                        disablePictureInPicture
                                                        onContextMenu={(e) => e.preventDefault()}
                                                        preload="metadata"
                                                        src={mediaUrl}
                                                        className="w-full h-full object-contain"
                                                    >
                                                        Your browser does not support HTML5 video playback.
                                                    </video>
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={idx} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 shadow-xs hover:border-blue-300 dark:hover:border-blue-800/50 transition-all">
                                            <div className="flex items-center justify-between flex-wrap gap-2.5">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                                                        <span className="material-symbols-outlined text-[20px]">
                                                            description
                                                        </span>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate" title={file.name}>
                                                            {file.name || 'Attached Document'}
                                                        </p>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 uppercase tracking-wider">
                                                                Document
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button 
                                                        type="button"
                                                        onClick={() => setActiveDocViewer({ name: file.name, url: mediaUrl })}
                                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                                                    >
                                                        <span className="material-symbols-outlined text-[15px]">visibility</span>
                                                        View Document
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2 mt-12 mb-8">
                        {article.tags && article.tags.map(tag => (
                            <span key={tag} className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-xs font-bold border border-slate-200 dark:border-slate-700">
                                #{tag}
                            </span>
                        ))}
                    </div>
                </article>

                {/*  Reaction Bar  */}
                <section className="border-y border-slate-200 dark:border-slate-800 py-4 my-12 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={handleLike} 
                            className={`flex items-center gap-2 group transition-all px-3 py-1.5 rounded-lg ${userLiked ? 'bg-blue-500/15 text-blue-500' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                        >
                            <span className="material-symbols-outlined text-[20px]" style={{fontVariationSettings: userLiked ? "'FILL' 1" : "'FILL' 0"}}>thumb_up</span>
                            <span className="text-xs font-bold">Like ({likes})</span>
                        </button>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-500">{views.toLocaleString()} views • {likes} reactions • {totalComments} comments</span>
                        <button 
                            onClick={() => setSharingArticleModal(article)}
                            className="px-3.5 py-1.5 bg-blue-500/10 hover:bg-blue-500 text-blue-600 dark:text-blue-400 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                            title="Share Article"
                        >
                            <span className="material-symbols-outlined text-[18px]">share</span>
                            <span>Share Article ({article?.shares || 0})</span>
                        </button>
                    </div>
                </section>

                {/*  Comments Section  */}
                <section>
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-6">Comments ({totalComments})</h3>
                    {/*  Comment Input  */}
                    <div className="flex gap-4 mb-10">
                        <div className="h-10 w-10 shrink-0 rounded-full bg-slate-200 border border-slate-350 overflow-hidden">
                            <img 
                                className="w-full h-full object-cover" 
                                alt="User avatar" 
                                src={currentUser?.profilePhotoUrl ? resolveMediaUrl(currentUser.profilePhotoUrl) : `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.fullName || 'User')}&background=6366f1&color=fff`} 
                            />
                        </div>
                        <div className="flex-1">
                            <textarea 
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                className="w-full p-4 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none h-24 mb-3" 
                                placeholder="Add a thoughtful comment..."
                            ></textarea>
                            <div className="flex justify-end items-center">
                                {(() => {
                                    const restrictedInComment = checkRestrictedContent(newComment);
                                    if (restrictedInComment) {
                                        return (
                                            <div className="flex items-center gap-1.5 text-rose-500 text-xs font-semibold px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-lg">
                                                <span className="material-symbols-outlined text-[16px]">warning</span>
                                                <span>Restricted word ("{restrictedInComment}") detected! Remove it to post comment.</span>
                                            </div>
                                        );
                                    }
                                    return (
                                        <button 
                                            onClick={handleAddComment}
                                            className="bg-blue-500 text-white px-6 py-2 rounded-lg font-bold text-xs hover:bg-blue-600 transition-all shadow-sm"
                                        >
                                            Post Comment
                                        </button>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* Comments List */}
                    <div className="space-y-6">
                        {comments.length > 0 ? (
                            comments.map(comment => (
                                <ArticleCommentThread key={comment.id} comment={comment} onReply={handleReplyComment} currentUser={currentUser} />
                            ))
                        ) : (
                            <p className="text-center text-xs text-slate-500 py-6">No comments yet. Be the first to start the discussion!</p>
                        )}
                    </div>
                </section>
            </main>

            <aside className="hidden xl:block w-[300px] p-6 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 h-[calc(100vh-72px)] sticky top-[72px] overflow-y-auto">
                <div className="space-y-6">
                    {/*  Community Widget  */}
                    <div className="bg-slate-50 dark:bg-slate-800/40 p-5 rounded-xl border border-slate-200 dark:border-slate-800">
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-4">About the Community</h4>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="h-12 w-12 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-600 dark:text-teal-400">
                                <span className="material-symbols-outlined text-2xl" style={{fontVariationSettings: "'FILL' 1"}}>architecture</span>
                            </div>
                            <div>
                                <p className="font-bold text-xs text-slate-900 dark:text-white">{article.community}</p>
                                <p className="text-[10px] text-slate-500">{article.members}</p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed mb-4">
                            {article.communityDesc}
                        </p>
                        <button className="w-full py-2 border border-blue-500 text-blue-500 font-bold text-xs rounded-lg hover:bg-blue-500/5 transition-all">Joined</button>
                    </div>

                    {/*  Related Content  */}
                    <div className="bg-slate-50 dark:bg-slate-800/40 p-5 rounded-xl border border-slate-200 dark:border-slate-800">
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-4">Related Content</h4>
                        <ul className="space-y-4">
                            {relatedArticles.length > 0 ? (
                                relatedArticles.map(art => (
                                    <li key={art.id} className="group">
                                        <Link to={`/article-view?id=${art.id}`}>
                                            <p className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-blue-500 transition-colors mb-1 line-clamp-2 leading-snug">
                                                {art.title}
                                            </p>
                                            <p className="text-[10px] text-slate-500">{art.readTime} • By {art.author.name}</p>
                                        </Link>
                                    </li>
                                ))
                            ) : (
                                <p className="text-xs text-slate-500">No other articles available.</p>
                            )}
                        </ul>
                    </div>

                    {/*  Trending Topics  */}
                    <div>
                        <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-650 uppercase tracking-widest mb-3">Trending Topics</h4>
                        <div className="flex flex-wrap gap-2">
                            {['strategy2024', 'knome_hq', 'product_ops', 'design_trends'].map(topic => (
                                <span key={topic} className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded text-[10px] font-bold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                                    #{topic}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </aside>

            {/* Report Article Modal */}
            <ReportModal
                isOpen={isReportOpen}
                onClose={() => setIsReportOpen(false)}
                targetType="Article"
                targetId={article?.articleId || article?.id || 1}
                targetName={article?.authorFullName || article?.author?.name || article?.authorName || 'Author'}
                targetUserId={article?.authorUserId || article?.author?.id}
                targetContent={article?.title || article?.summary || ''}
            />

            {/* Save to Category Modal */}
            <SaveToCategoryModal
                isOpen={!!savingArticleModal}
                onClose={() => setSavingArticleModal(null)}
                item={savingArticleModal}
            />

            {/* Share Article Modal */}
            <ArticleShareModal
                isOpen={!!sharingArticleModal}
                onClose={() => setSharingArticleModal(null)}
                article={sharingArticleModal}
                contentType="Article"
            />

            {/* Document Viewer Modal */}
            {activeDocViewer && (
                <DocumentViewerModal 
                    document={activeDocViewer} 
                    onClose={() => setActiveDocViewer(null)} 
                />
            )}
        </>
    );
}

// Thread sub-component
function ArticleCommentThread({ comment, depth = 0, onReply, currentUser }) {
    const [isReplying, setIsReplying] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [likesCount, setLikesCount] = useState(comment.likesCount || 0);
    const initialReaction = comment.userReaction || (comment.isLiked ? 'like' : null);
    const [reaction, setReaction] = useState(initialReaction);
    const [reactionHover, setReactionHover] = useState(false);
    const hoverTimeoutRef = React.useRef(null);
    const [isReactionsModalOpen, setIsReactionsModalOpen] = useState(false);
    const replies = comment.replies || [];

    useEffect(() => {
        setLikesCount(comment.likesCount || 0);
        setReaction(comment.userReaction || (comment.isLiked ? 'like' : null));
    }, [comment.likesCount, comment.isLiked, comment.userReaction]);

    const activeCommentReactionTypes = React.useMemo(() => {
        const types = new Set();
        if (Array.isArray(comment.topReactionTypes)) {
            comment.topReactionTypes.forEach(t => t && types.add(t.toLowerCase()));
        }
        if (reaction) {
            types.add(reaction.toLowerCase());
        }
        if (types.size === 0 && likesCount > 0) {
            types.add('like');
        }
        return Array.from(types);
    }, [comment.topReactionTypes, reaction, likesCount]);

    const toggleCommentReaction = async (type) => {
        if (!comment.id) return;
        const previousReaction = reaction;
        const newReaction = reaction === type ? null : type;

        setReaction(newReaction);
        if (previousReaction && !newReaction) {
            setLikesCount(prev => Math.max(0, prev - 1));
        } else if (!previousReaction && newReaction) {
            setLikesCount(prev => prev + 1);
        }
        setReactionHover(false);

        const reactionTypeToSend = newReaction || previousReaction;
        if (!reactionTypeToSend) return;
        const formattedReaction = reactionTypeToSend.charAt(0).toUpperCase() + reactionTypeToSend.slice(1);

        try {
            await interactionsApi.toggleReaction('Comment', comment.id, formattedReaction);
        } catch (error) {
            console.error('Failed to toggle comment reaction', error);
            setReaction(previousReaction);
            if (previousReaction && !newReaction) {
                setLikesCount(prev => prev + 1);
            } else if (!previousReaction && newReaction) {
                setLikesCount(prev => Math.max(0, prev - 1));
            }
        }
    };

    const submitReply = (e) => {
        e.preventDefault();
        if (!replyText.trim()) return;

        if (onReply) {
            onReply(comment.id, replyText.trim());
        }
        setReplyText('');
        setIsReplying(false);
    };

    const avatarUrl = comment.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.author || 'User')}&background=6366f1&color=fff`;

    return (
        <div className="flex gap-4">
            {/* ── Comment Reactions Modal ── */}
            <ReactionsModal
                isOpen={isReactionsModalOpen}
                onClose={() => setIsReactionsModalOpen(false)}
                contentType="Comment"
                contentId={comment.id}
            />

            <div className="h-9 w-9 shrink-0 rounded-full bg-slate-100 border border-slate-200 dark:border-slate-800 overflow-hidden">
                <img 
                    className="w-full h-full object-cover" 
                    src={avatarUrl} 
                    alt={comment.author || 'Avatar'} 
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.author || 'User')}&background=6366f1&color=fff`;
                    }}
                />
            </div>
            <div className="flex-1">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800/80 inline-block max-w-full">
                    <div className="flex items-center justify-between gap-4 mb-2">
                        <span className="font-bold text-xs text-slate-900 dark:text-white">{comment.author}</span>
                        <span className="text-[10px] text-slate-500">{comment.time}</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-350 leading-relaxed whitespace-pre-wrap">
                        {comment.text}
                    </p>
                </div>
                
                <div className="flex items-center gap-3 mt-1.5 ml-2 text-[11px] font-bold text-slate-500">
                    <div 
                        className="relative flex items-center"
                        onMouseEnter={() => {
                            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                            hoverTimeoutRef.current = setTimeout(() => setReactionHover(true), 150);
                        }}
                        onMouseLeave={() => {
                            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                            hoverTimeoutRef.current = setTimeout(() => setReactionHover(false), 350);
                        }}
                    >
                        {/* Reaction Popover */}
                        {reactionHover && (
                            <div 
                                className="absolute bottom-full left-0 mb-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-full px-2 py-1.5 flex gap-1.5 animate-in fade-in slide-in-from-bottom-2 z-30"
                                onMouseEnter={() => {
                                    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                                    setReactionHover(true);
                                }}
                                onMouseLeave={() => {
                                    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                                    hoverTimeoutRef.current = setTimeout(() => setReactionHover(false), 350);
                                }}
                            >
                                <div className="absolute top-full left-0 right-0 h-3" />
                                {Object.entries(REACTION_TYPES).map(([key, data]) => (
                                    <button 
                                        key={key}
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleCommentReaction(key);
                                        }}
                                        className="w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-transform hover:scale-125 cursor-pointer"
                                        title={data.label}
                                    >
                                        <span className="text-[16px]">{data.icon}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        <button 
                            type="button"
                            onClick={() => toggleCommentReaction(reaction ? null : 'like')} 
                            className={`transition-colors flex items-center gap-1 cursor-pointer ${reaction ? (REACTION_TYPES[reaction]?.color || 'text-blue-600') : 'hover:text-blue-500'}`}
                        >
                            {reaction ? (
                                <>
                                    <span className="text-[14px]">{REACTION_TYPES[reaction]?.icon || '👍'}</span>
                                    <span>{REACTION_TYPES[reaction]?.label || 'Liked'}</span>
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-[14px]">thumb_up</span>
                                    <span>Like</span>
                                </>
                            )}
                        </button>
                    </div>

                    {/* Reaction Counter Pill (only if likesCount > 0) */}
                    {likesCount > 0 && (
                        <button 
                            type="button"
                            onClick={() => setIsReactionsModalOpen(true)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer group text-[11px]"
                            title="View who reacted"
                        >
                            <div className="flex items-center -space-x-1">
                                {activeCommentReactionTypes.map(t => {
                                    const meta = REACTION_TYPES[t] || REACTION_TYPES.like;
                                    const bgClass = t === 'heart' ? 'bg-rose-500' : t === 'celebrate' ? 'bg-amber-500' : t === 'support' ? 'bg-purple-500' : 'bg-blue-500';
                                    return (
                                        <span 
                                            key={t}
                                            className={`w-3.5 h-3.5 rounded-full ${bgClass} text-white flex items-center justify-center text-[8px] shadow-xs`}
                                        >
                                            {meta.icon}
                                        </span>
                                    );
                                })}
                            </div>
                            <span className="font-bold text-slate-700 dark:text-slate-300 group-hover:underline">
                                {likesCount}
                            </span>
                        </button>
                    )}

                    <button 
                        type="button"
                        onClick={() => setIsReplying(!isReplying)} 
                        className="hover:text-blue-500 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[14px]">reply</span>
                        <span>Reply</span>
                    </button>
                </div>

                {isReplying && (
                    <form onSubmit={submitReply} className="mt-3 flex items-center gap-2 max-w-md">
                        <div className="relative flex-1">
                            <input 
                                type="text" 
                                autoFocus
                                placeholder={`Reply to ${comment.author}...`} 
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full pl-4 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                            />
                        </div>
                        {(() => {
                            const restrictedInReply = checkRestrictedContent(replyText);
                            if (restrictedInReply) {
                                return (
                                    <div className="flex items-center gap-1 text-rose-500 text-xs font-semibold px-2.5 py-1 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-full shrink-0">
                                        <span className="material-symbols-outlined text-[14px]">warning</span>
                                        <span>Restricted word ("{restrictedInReply}")</span>
                                    </div>
                                );
                            }
                            return (
                                <button 
                                    type="submit"
                                    disabled={!replyText.trim()}
                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-full text-xs font-semibold flex items-center gap-1 transition-all shrink-0 shadow-sm"
                                >
                                    <span className="material-symbols-outlined text-[14px]">send</span>
                                    <span>Reply</span>
                                </button>
                            );
                        })()}
                        <button 
                            type="button"
                            onClick={() => { setIsReplying(false); setReplyText(''); }}
                            className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium transition-colors shrink-0"
                        >
                            Cancel
                        </button>
                    </form>
                )}

                {/* Replies */}
                {replies && replies.length > 0 && (
                    <div className="mt-4 space-y-4 border-l border-slate-100 dark:border-slate-800 pl-4">
                        {replies.map(reply => (
                            <ArticleCommentThread key={reply.id} comment={reply} depth={depth + 1} onReply={onReply} currentUser={currentUser} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
