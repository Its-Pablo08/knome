/**
 * Safe client-side HTML sanitizer using native browser DOMParser.
 * Removes script/iframe/object tags and dangerous event handlers (WIKI-001).
 */
export function sanitizeHtml(rawHtml) {
    if (!rawHtml) return '';
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(rawHtml, 'text/html');

        // Disallow dangerous elements
        const dangerousTags = ['script', 'iframe', 'object', 'embed', 'applet', 'meta', 'link', 'style', 'base', 'form'];
        dangerousTags.forEach(tag => {
            const elements = doc.body.querySelectorAll(tag);
            elements.forEach(el => el.remove());
        });

        // Strip inline event handlers and pseudo-protocol hrefs
        const allElements = doc.body.querySelectorAll('*');
        allElements.forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                const name = attr.name.toLowerCase();
                const value = attr.value.trim().toLowerCase();
                if (name.startsWith('on')) {
                    el.removeAttribute(attr.name);
                } else if ((name === 'href' || name === 'src' || name === 'action') && value.startsWith('javascript:')) {
                    el.removeAttribute(attr.name);
                }
            });
        });

        return doc.body.innerHTML;
    } catch {
        return rawHtml;
    }
}
