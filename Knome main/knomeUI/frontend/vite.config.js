import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_DIR = path.resolve(__dirname, 'src/data')
const PLAYLISTS_FILE = path.resolve(DATA_DIR, 'shared_playlists.json')
const IMPORTED_VIDEOS_FILE = path.resolve(DATA_DIR, 'shared_imported_videos.json')

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PLAYLISTS_FILE)) {
    fs.writeFileSync(PLAYLISTS_FILE, '[]', 'utf-8');
  }
  if (!fs.existsSync(IMPORTED_VIDEOS_FILE)) {
    fs.writeFileSync(IMPORTED_VIDEOS_FILE, '[]', 'utf-8');
  }
}

function readJsonFile(filePath, fallback = []) {
  try {
    ensureDataFiles();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return data ? JSON.parse(data) : fallback;
    }
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e);
  }
  return fallback;
}

function writeJsonFile(filePath, data) {
  try {
    ensureDataFiles();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error(`Error writing ${filePath}:`, e);
    return false;
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (_) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function playlistsSyncPlugin() {
  return {
    name: 'playlists-sync-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlObj = new URL(req.url, 'http://localhost:5173');
        const pathname = urlObj.pathname;

        // 1. /api/shared-playlists/sync
        if (pathname === '/api/shared-playlists/sync' && req.method === 'POST') {
          const body = await readBody(req);
          const clientPlaylists = Array.isArray(body.playlists) ? body.playlists : [];
          let serverPlaylists = readJsonFile(PLAYLISTS_FILE, []);

          clientPlaylists.forEach(cp => {
            if (!cp || !cp.title) return;
            const existingIdx = serverPlaylists.findIndex(sp => 
              (sp.id && cp.id && sp.id === cp.id) ||
              (sp.title && cp.title && sp.title.trim().toLowerCase() === cp.title.trim().toLowerCase() && 
               (sp.author || '').trim().toLowerCase() === (cp.author || '').trim().toLowerCase())
            );
            if (existingIdx === -1) {
              serverPlaylists.unshift(cp);
            } else {
              const existing = serverPlaylists[existingIdx];
              const mergedEpisodes = (cp.episodes && cp.episodes.length >= (existing.episodes?.length || 0))
                ? cp.episodes
                : (existing.episodes || cp.episodes || []);
              serverPlaylists[existingIdx] = {
                ...existing,
                ...cp,
                episodes: mergedEpisodes
              };
            }
          });

          writeJsonFile(PLAYLISTS_FILE, serverPlaylists);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, playlists: serverPlaylists }));
          return;
        }

        // 2. /api/shared-playlists
        if (pathname === '/api/shared-playlists') {
          if (req.method === 'GET') {
            const list = readJsonFile(PLAYLISTS_FILE, []);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(list));
            return;
          }

          if (req.method === 'POST') {
            const body = await readBody(req);
            const playlist = body.playlist || body;
            if (playlist && playlist.title) {
              let serverPlaylists = readJsonFile(PLAYLISTS_FILE, []);
              const existingIdx = serverPlaylists.findIndex(sp => 
                (sp.id && playlist.id && sp.id === playlist.id) ||
                (sp.title && playlist.title && sp.title.trim().toLowerCase() === playlist.title.trim().toLowerCase() &&
                 (sp.author || '').trim().toLowerCase() === (playlist.author || '').trim().toLowerCase())
              );
              if (existingIdx !== -1) {
                serverPlaylists[existingIdx] = { ...serverPlaylists[existingIdx], ...playlist };
              } else {
                serverPlaylists.unshift(playlist);
              }
              writeJsonFile(PLAYLISTS_FILE, serverPlaylists);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, playlists: serverPlaylists }));
              return;
            }
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Invalid playlist' }));
            return;
          }

          if (req.method === 'DELETE') {
            const id = urlObj.searchParams.get('id');
            if (id) {
              let serverPlaylists = readJsonFile(PLAYLISTS_FILE, []);
              serverPlaylists = serverPlaylists.filter(sp => sp.id !== id);
              writeJsonFile(PLAYLISTS_FILE, serverPlaylists);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
              return;
            }
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Missing id parameter' }));
            return;
          }
        }

        // 3. /api/shared-imported-videos/sync
        if (pathname === '/api/shared-imported-videos/sync' && req.method === 'POST') {
          const body = await readBody(req);
          const clientVideos = Array.isArray(body.videos) ? body.videos : [];
          let serverVideos = readJsonFile(IMPORTED_VIDEOS_FILE, []);

          clientVideos.forEach(cv => {
            if (!cv || !cv.id) return;
            const existingIdx = serverVideos.findIndex(sv => sv.id === cv.id);
            if (existingIdx === -1) {
              serverVideos.push(cv);
            } else {
              serverVideos[existingIdx] = { ...serverVideos[existingIdx], ...cv };
            }
          });

          writeJsonFile(IMPORTED_VIDEOS_FILE, serverVideos);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, videos: serverVideos }));
          return;
        }

        // 4. /api/shared-imported-videos
        if (pathname === '/api/shared-imported-videos') {
          if (req.method === 'GET') {
            const list = readJsonFile(IMPORTED_VIDEOS_FILE, []);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(list));
            return;
          }

          if (req.method === 'POST') {
            const body = await readBody(req);
            const videosToAdd = Array.isArray(body.videos) ? body.videos : (body.id ? [body] : []);
            let serverVideos = readJsonFile(IMPORTED_VIDEOS_FILE, []);
            videosToAdd.forEach(v => {
              const idx = serverVideos.findIndex(sv => sv.id === v.id);
              if (idx !== -1) {
                serverVideos[idx] = { ...serverVideos[idx], ...v };
              } else {
                serverVideos.push(v);
              }
            });
            writeJsonFile(IMPORTED_VIDEOS_FILE, serverVideos);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, videos: serverVideos }));
            return;
          }

          if (req.method === 'DELETE') {
            const playlistId = urlObj.searchParams.get('playlistId');
            if (playlistId) {
              let serverVideos = readJsonFile(IMPORTED_VIDEOS_FILE, []);
              serverVideos = serverVideos.filter(sv => sv.playlistId !== playlistId);
              writeJsonFile(IMPORTED_VIDEOS_FILE, serverVideos);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
              return;
            }
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Missing playlistId parameter' }));
            return;
          }
        }

        next();
      });
    }
  };
}

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

function hrmsJobsPlugin() {
  return {
    name: 'hrms-jobs-proxy',
    configureServer(server) {
      server.middlewares.use('/api/hrms-jobs', async (req, res) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2500);
          const remoteRes = await fetch('http://counselling-1.mponline.demo.gov.in:5110/api/v1/job-postings/integration/list', {
            method: 'GET',
            headers: {
              'X-Client-Id': 'mpo-hrms-Client',
              'X-Client-Secret': 'hrms-super-secret-key-12345'
            },
            signal: controller.signal
          }).catch(() => null);
          clearTimeout(timeout);

          if (remoteRes && remoteRes.ok) {
            const data = await remoteRes.json();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
            return;
          }
        } catch (_) {}

        // Always return clean 200 with fallback data so browser console never logs a 500 network error
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, data: [] }));
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ytPlaylistPlugin(), hrmsJobsPlugin(), playlistsSyncPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/uploads': {
        target: 'http://localhost:5096',
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
            if (id.includes('xlsx')) {
              return 'vendor-xlsx';
            }
            if (id.includes('@microsoft/signalr')) {
              return 'vendor-signalr';
            }
            return 'vendor';
          }
        }
      }
    }
  }
})
