import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function ytPlaylistPlugin() {
  return {
    name: 'yt-playlist-proxy',
    configureServer(server) {
      server.middlewares.use('/api/yt-playlist', async (req, res) => {
        try {
          const urlObj = new URL(req.url, 'http://localhost:5173');
          const listId = urlObj.searchParams.get('list');
          if (!listId) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Missing list parameter' }));
            return;
          }
          const ytRes = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(listId)}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
          });
          if (!ytRes.ok) {
            res.statusCode = ytRes.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: `YouTube responded with ${ytRes.status}` }));
            return;
          }
          const xml = await ytRes.text();
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          res.end(xml);
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ytPlaylistPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/uploads': {
        target: 'http://localhost:5095',
        changeOrigin: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-lucide';
            }
            return 'vendor';
          }
        }
      }
    }
  }
})
