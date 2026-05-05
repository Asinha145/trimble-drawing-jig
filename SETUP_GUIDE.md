# Trimble JIG Drawing Tool - Setup Guide

## Quick Start

### Option 1: Local Development with Cloudflare Tunnel (Recommended)

1. **Start the dev server and tunnel:**
   ```bash
   # From the project root directory:
   npm run dev
   ```
   
   In another terminal:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

2. **Copy the tunnel URL** (looks like `https://xxxxx.trycloudflare.com`)

3. **Update the manifest:**
   - Open `public/tc_dev_manifest.json`
   - Replace the `url` value with your tunnel URL + `/index.html`
   - Example: `https://xxxxx.trycloudflare.com/index.html`

4. **Load in Trimble Connect:**
   - Go to https://connect.trimble.com
   - Load your JIG project
   - Add the extension URL: paste the manifest URL from step 3
   - Click View 4 to see the measurements

### Option 2: Cloudflare Pages (Static Deployment)

For production, the app is also deployed to Cloudflare Pages:
- URL: https://trimble-jig.pages.dev
- Note: This works best when accessed from Trimble Connect environment

## Troubleshooting

### Extension shows "JIG Drawing Tool" but no View buttons
- Check browser console for errors
- Ensure you're loading the extension within a Trimble Connect project

### "Failed to load JIG model"
- The extension must be loaded through Trimble Connect with an actual JIG model
- It won't work when visiting the URL directly in a browser

### View 4 not showing measurements
- Check that the JIG model has vertical bars
- Open browser DevTools (F12) and check the Console tab
- Look for "Found JigDatum" logs

## Development

### Running locally:
```bash
npm install
npm run dev        # Start Vite dev server
npm run build      # Build for production
```

### File Structure:
- `src/App.tsx` - Main application component
- `src/components/JigPanel.tsx` - JIG view component with 8 view buttons
- `src/module/TCJigData.ts` - JIG data extraction and View 4 measurements logic
- `src/module/TCEntryPoint.ts` - Trimble Connect API initialization

## View 4 Implementation

View 4 displays:
- Vertical bars sorted by distance from datum
- Red measurement lines from bar bottom to closest horizontal bar center
- Grouped by unique bar mark (extracted from part number)

The measurements use the `buildView4VerticalBarDimensions()` function which:
1. Scans all model objects
2. Classifies bars as vertical or horizontal
3. Sorts vertical bars by distance from datum
4. Creates measurements with ANNOTATION_RED color
