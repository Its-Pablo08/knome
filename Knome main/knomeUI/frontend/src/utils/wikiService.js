import { apiClient } from './apiClient';
import { resolveMediaUrl } from './apiService';

export const wikiApi = {
    // Wikis
    async getWikis(params = {}) {
        const query = new URLSearchParams();
        if (params.tab) query.append('tab', params.tab);
        if (params.search) query.append('search', params.search);
        if (params.tag) query.append('tag', params.tag);
        if (params.status && params.status !== 'All') query.append('status', params.status);
        if (params.communityId) query.append('communityId', params.communityId);
        if (params.pageNumber) query.append('pageNumber', params.pageNumber);
        if (params.pageSize) query.append('pageSize', params.pageSize);

        const res = await apiClient.get(`/wikis?${query.toString()}`);
        return res?.data || res;
    },

    async getMyWikis(pageNumber = 1, pageSize = 20) {
        const res = await apiClient.get(`/wikis/my?pageNumber=${pageNumber}&pageSize=${pageSize}`);
        return res?.data || res;
    },

    async getSharedWithMeWikis(pageNumber = 1, pageSize = 20) {
        const res = await apiClient.get(`/wikis/shared?pageNumber=${pageNumber}&pageSize=${pageSize}`);
        return res?.data || res;
    },

    async getRecentlyUpdatedWikis(count = 10) {
        const res = await apiClient.get(`/wikis/recent?count=${count}`);
        return res?.data || res;
    },

    async getWiki(id) {
        const res = await apiClient.get(`/wikis/${id}`);
        return res?.data || res;
    },

    async createWiki(payload) {
        const res = await apiClient.post('/wikis', payload);
        return res?.data || res;
    },

    async updateWiki(id, payload) {
        const res = await apiClient.put(`/wikis/${id}`, payload);
        return res?.data || res;
    },

    async deleteWiki(id) {
        const res = await apiClient.delete(`/wikis/${id}`);
        return res?.data || res;
    },

    async restoreWiki(id) {
        const res = await apiClient.post(`/wikis/${id}/restore`);
        return res?.data || res;
    },

    async toggleArchiveWiki(id, isArchived = true) {
        const res = await apiClient.post(`/wikis/${id}/archive`, { isArchived });
        return res?.data || res;
    },

    async recordWikiView(id) {
        try {
            const res = await apiClient.post(`/wikis/${id}/view`);
            return res?.data || res;
        } catch {
            return null;
        }
    },

    async getPopularTags(count = 20) {
        try {
            const res = await apiClient.get(`/wikis/tags?count=${count}`);
            return res?.data || res;
        } catch {
            return [];
        }
    },

    // Sections
    async getSections(wikiId) {
        const res = await apiClient.get(`/wikis/${wikiId}/sections`);
        return res?.data || res;
    },

    async getSection(wikiId, sectionId) {
        const res = await apiClient.get(`/wikis/${wikiId}/sections/${sectionId}`);
        return res?.data || res;
    },

    async createSection(wikiId, payload) {
        const res = await apiClient.post(`/wikis/${wikiId}/sections`, payload);
        return res?.data || res;
    },

    async updateSection(wikiId, sectionId, payload) {
        const res = await apiClient.put(`/wikis/${wikiId}/sections/${sectionId}`, payload);
        return res?.data || res;
    },

    async deleteSection(wikiId, sectionId) {
        const res = await apiClient.delete(`/wikis/${wikiId}/sections/${sectionId}`);
        return res?.data || res;
    },

    async reorderSections(wikiId, items) {
        const res = await apiClient.put(`/wikis/${wikiId}/sections/reorder`, { items });
        return res?.data || res;
    },

    // Collaborators
    async getCollaborators(wikiId) {
        const res = await apiClient.get(`/wikis/${wikiId}/collaborators`);
        return res?.data || res;
    },

    async addCollaborator(wikiId, payload) {
        const res = await apiClient.post(`/wikis/${wikiId}/collaborators`, payload);
        return res?.data || res;
    },

    async removeCollaborator(wikiId, collaboratorId) {
        const res = await apiClient.delete(`/wikis/${wikiId}/collaborators/${collaboratorId}`);
        return res?.data || res;
    },

    // Shares
    async getShares(wikiId) {
        const res = await apiClient.get(`/wikis/${wikiId}/shares`);
        return res?.data || res;
    },

    async shareWiki(wikiId, payload) {
        const res = await apiClient.post(`/wikis/${wikiId}/shares`, payload);
        return res?.data || res;
    },

    async removeShare(wikiId, shareId) {
        const res = await apiClient.delete(`/wikis/${wikiId}/shares/${shareId}`);
        return res?.data || res;
    },

    async getDepartments() {
        const res = await apiClient.get('/wikis/departments');
        return res?.data || res;
    },

    // Versions
    async getVersions(wikiId, sectionId = null) {
        const url = sectionId 
            ? `/wikis/${wikiId}/versions?sectionId=${sectionId}` 
            : `/wikis/${wikiId}/versions`;
        const res = await apiClient.get(url);
        return res?.data || res;
    },

    async getVersionDetail(wikiId, versionId) {
        const res = await apiClient.get(`/wikis/${wikiId}/versions/${versionId}`);
        return res?.data || res;
    },

    async restoreVersion(wikiId, versionId, restoreComment = '') {
        const res = await apiClient.post(`/wikis/${wikiId}/versions/${versionId}/restore`, {
            restoreComment
        });
        return res?.data || res;
    },

    // Activities
    async getActivities(wikiId) {
        const res = await apiClient.get(`/wikis/${wikiId}/activities`);
        return res?.data || res;
    }
};

export default wikiApi;
