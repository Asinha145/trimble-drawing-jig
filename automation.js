import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8888;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'automation-dashboard')));

// State management
const state = {
  httpServer: null,
  tunnel: null,
  build: null,
  logs: [],
  status: {
    httpServer: 'stopped',
    tunnel: 'stopped',
    build: 'idle'
  },
  tunnelUrl: null,
  modelId: 'WqDG_Eqdewo',
  projectId: 'kvmzNBdWgCM'
};

const MAX_LOGS = 500;

function addLog(service, message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = { timestamp, service, message, type };
  state.logs.push(logEntry);
  if (state.logs.length > MAX_LOGS) state.logs.shift();
  console.log(`[${service}] ${message}`);
  broadcastUpdate();
}

function broadcastUpdate() {
  // Store update for SSE clients to fetch
  state.lastUpdate = Date.now();
}

// Vite Dev Server Control
app.post('/api/http-server/start', (req, res) => {
  if (state.httpServer) {
    return res.json({ success: false, error: 'Server already running' });
  }

  addLog('VITE', 'Starting Vite dev server on port 5173...');
  state.status.httpServer = 'starting';
  broadcastUpdate();

  const server = spawn('npm', ['run', 'dev'], {
    cwd: __dirname,
    shell: true,
  });

  state.httpServer = server;

  server.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) addLog('VITE', msg);
  });

  server.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) addLog('VITE', msg, 'error');
  });

  server.on('error', (err) => {
    addLog('VITE', `Error: ${err.message}`, 'error');
    state.status.httpServer = 'error';
    state.httpServer = null;
  });

  server.on('close', (code) => {
    addLog('VITE', `Server stopped (code ${code})`);
    state.status.httpServer = 'stopped';
    state.httpServer = null;
  });

  state.status.httpServer = 'running';
  addLog('VITE', 'Vite dev server started successfully (port 5173, HMR enabled)');
  res.json({ success: true });
});

app.post('/api/http-server/stop', (req, res) => {
  if (!state.httpServer) {
    return res.json({ success: false, error: 'Server not running' });
  }

  addLog('HTTP', 'Stopping HTTP server...');
  state.httpServer.kill();
  state.httpServer = null;
  state.status.httpServer = 'stopped';
  res.json({ success: true });
});

// Cloudflare Tunnel Control
app.post('/api/tunnel/start', (req, res) => {
  if (state.tunnel) {
    return res.json({ success: false, error: 'Tunnel already running' });
  }

  addLog('TUNNEL', 'Starting Cloudflare tunnel to http://localhost:5173...');
  state.status.tunnel = 'starting';
  broadcastUpdate();

  const tunnel = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:5173'], {
    shell: true,
  });

  state.tunnel = tunnel;

  tunnel.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      addLog('TUNNEL', msg);
      // Extract tunnel URL
      if (msg.includes('https://')) {
        const match = msg.match(/(https:\/\/[^\s]+\.trycloudflare\.com)/);
        if (match) {
          state.tunnelUrl = match[1];
          addLog('TUNNEL', `Tunnel URL: ${state.tunnelUrl}`, 'success');
        }
      }
    }
  });

  tunnel.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) addLog('TUNNEL', msg, 'error');
  });

  tunnel.on('error', (err) => {
    addLog('TUNNEL', `Error: ${err.message}`, 'error');
    state.status.tunnel = 'error';
    state.tunnel = null;
  });

  tunnel.on('close', (code) => {
    addLog('TUNNEL', `Tunnel stopped (code ${code})`);
    state.status.tunnel = 'stopped';
    state.tunnel = null;
  });

  state.status.tunnel = 'running';
  addLog('TUNNEL', 'Tunnel started, waiting for URL...');
  res.json({ success: true });
});

app.post('/api/tunnel/stop', (req, res) => {
  if (!state.tunnel) {
    return res.json({ success: false, error: 'Tunnel not running' });
  }

  addLog('TUNNEL', 'Stopping tunnel...');
  state.tunnel.kill();
  state.tunnel = null;
  state.status.tunnel = 'stopped';
  res.json({ success: true });
});

// Build Control
app.post('/api/build', (req, res) => {
  if (state.build) {
    return res.json({ success: false, error: 'Build already in progress' });
  }

  addLog('BUILD', 'Starting npm build...');
  state.status.build = 'building';
  broadcastUpdate();

  const build = spawn('npm', ['run', 'build'], {
    cwd: __dirname,
    shell: true,
  });

  state.build = build;

  build.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) addLog('BUILD', msg);
  });

  build.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) addLog('BUILD', msg, 'error');
  });

  build.on('close', (code) => {
    if (code === 0) {
      addLog('BUILD', 'Build completed successfully', 'success');
      state.status.build = 'idle';
    } else {
      addLog('BUILD', `Build failed with code ${code}`, 'error');
      state.status.build = 'error';
    }
    state.build = null;
    broadcastUpdate();
  });

  res.json({ success: true });
});

// Status API
app.get('/api/status', (req, res) => {
  res.json({
    status: state.status,
    tunnelUrl: state.tunnelUrl,
    logs: state.logs.slice(-100),
    modelId: state.modelId,
    projectId: state.projectId,
  });
});

// File Editor API
app.get('/api/file/:filename', (req, res) => {
  const allowed = ['tc_dev_manifest.json', 'vite.config.ts', 'package.json'];
  if (!allowed.includes(req.params.filename)) {
    return res.status(403).json({ error: 'File not allowed' });
  }

  const filePath = path.join(__dirname, req.params.filename);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ content });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.post('/api/file/:filename', (req, res) => {
  const allowed = ['tc_dev_manifest.json', 'vite.config.ts', 'package.json'];
  if (!allowed.includes(req.params.filename)) {
    return res.status(403).json({ error: 'File not allowed' });
  }

  const filePath = path.join(__dirname, req.params.filename);
  try {
    fs.writeFileSync(filePath, req.body.content, 'utf8');
    addLog('EDITOR', `Saved ${req.params.filename}`, 'success');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Quick Links API
app.get('/api/links', (req, res) => {
  const manifestUrl = state.tunnelUrl ? `${state.tunnelUrl}/tc_dev_manifest.json` : 'waiting for tunnel...';
  const trimbleUrl = `https://web.connect.trimble.com/projects/${state.projectId}/viewer/3d/?modelId=${state.modelId}&origin=app21.connect.trimble.com`;

  res.json({
    manifest: manifestUrl,
    trimble: trimbleUrl,
    localhost: 'http://localhost:5173',
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Automation Dashboard running on http://localhost:${PORT}`);
  addLog('SYSTEM', 'Dashboard initialized');
});
