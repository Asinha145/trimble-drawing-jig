# 🎯 Trimble JIG - Automation Dashboard

A local browser-based automation tool for managing the Trimble digital work instructions extension development.

## What It Does

- **Control Services:** Start/stop HTTP server, Cloudflare tunnel, and builds
- **Real-time Console:** View logs from all services in one place
- **File Editor:** Edit manifest, Vite config, and package.json without leaving the browser
- **Quick Links:** One-click access to Trimble Connect, manifest URL, and local server

## Setup

### 1. Install Dependencies
```bash
cd "C:\Users\ashis\Trimble Drawing\digital-work-instructions"
npm install
```

### 2. Start the Automation Dashboard
```bash
npm run automation
```

This starts the dashboard on **http://localhost:8888**

## How to Use

### Service Controls
- **Start HTTP:** Launches `http-server dist -p 7777`
- **Start Tunnel:** Launches Cloudflare tunnel, auto-extracts URL
- **Build:** Runs `npm run build` and shows output

### Console
View real-time logs from:
- HTTP server startup/errors
- Tunnel URL discovery
- Build output and errors
- System events

### File Editor
Edit three key files directly in the browser:
1. `tc_dev_manifest.json` - Update manifest URLs
2. `vite.config.ts` - Modify build config
3. `package.json` - Update dependencies

Changes are saved immediately.

### Quick Links
One-click buttons to open:
- **Manifest URL** - Copy the full manifest URL to clipboard
- **Trimble Connect** - Open the test project in Trimble
- **Local HTTP** - View the local server output

## Workflow

### Typical Development Session
1. Open http://localhost:8888
2. Click "Start HTTP" → watch console for startup
3. Click "Start Tunnel" → wait for URL to appear
4. Update manifest in Trimble Connect with the new URL
5. Open Trimble Connect project
6. Make code changes, click "Build"
7. Refresh Trimble to see changes

### When Services Fail
- Check console for error messages
- Edit relevant config file
- Restart the service

## Keyboard Shortcuts

- Click "Copy" on any link to copy to clipboard
- Change files in the editor dropdown
- Status indicators update every 2 seconds

## Notes

- Tunnel URL changes each time you restart the tunnel
- Always update the manifest URL in Trimble Connect when tunnel restarts
- HTTP server and tunnel can run simultaneously
- All logs are kept (max 500 entries, oldest removed first)

## Troubleshooting

### Dashboard not opening?
```bash
npm run automation
```
Then navigate to http://localhost:8888

### Services not starting?
- Check if port 7777 is already in use
- Verify cloudflared is installed globally: `cloudflared --version`
- Check console for detailed error messages

### Build failing?
- Check that TypeScript compiles: `npm run build`
- Look at error messages in console
- Verify all dependencies are installed

---

**Last Updated:** 2026-05-05
