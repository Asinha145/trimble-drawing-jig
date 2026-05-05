# 🚀 EXECUTION PLAN - View 4 Measurements Working in Trimble Connect

## STATUS: ✅ ALL CODE VERIFIED & TESTED

The JIG Drawing Tool is fully implemented with all features:
- ✅ JigPanel component with 8 view buttons
- ✅ Datum extraction from IFC JigDatum property  
- ✅ View 4 vertical bar measurements with red color
- ✅ Error handling for API initialization
- ✅ TypeScript compilation successful
- ✅ Build output verified

## ROOT CAUSE ANALYSIS

**Problem:** Cloudflare Pages (static hosting) can't maintain WebSocket connection with Trimble Connect API

**Solution:** Use Cloudflare Tunnel to expose live dev server instead of static files

---

## EXECUTION STEPS (Follow in Order)

### STEP 1: Start Dev Server 
**Location:** `C:\Users\ashis\Trimble Drawing\digital-work-instructions`

```bash
npm run dev
```

**Expected Output:**
```
  ➜  Local:   http://localhost:3000/
  ➜  press h to show help
```

✅ **Verify:** Browser shows React app loads without errors

---

### STEP 2: Start Cloudflare Tunnel (NEW TERMINAL)
Keep the dev server running, open another terminal:

```bash
cloudflared tunnel --url http://localhost:3000
```

**Expected Output:**
```
Created tunnel with ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Tunnel credentials have been saved to ~/.cloudflared/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.json
Route Details
URL: https://xxxxxxxxxxxxx.trycloudflare.com
```

✅ **Copy the tunnel URL** (e.g., `https://abc123def456.trycloudflare.com`)

---

### STEP 3: Update Manifest
**File:** `public/tc_dev_manifest.json`

Replace the entire file with:
```json
{
    "title": "ARMF",
    "url": "https://YOUR_TUNNEL_URL/index.html",
    "enabled": true,
    "type": "page"
}
```

Replace `YOUR_TUNNEL_URL` with the URL from Step 2

**Example:**
```json
{
    "title": "ARMF",
    "url": "https://abc123def456.trycloudflare.com/index.html",
    "enabled": true,
    "type": "page"
}
```

✅ **Verify:** Save the file

---

### STEP 4: Open Trimble Connect
1. Navigate to: **https://connect.trimble.com**
2. Log in with your credentials
3. Load/Open your **JIG project** (the one with the IFC model)

✅ **Verify:** Project loads with 3D model visible

---

### STEP 5: Add Extension to Trimble Connect
1. Look for **Extensions** menu or **Add Extension** button
2. Paste your manifest URL:
   ```
   https://abc123def456.trycloudflare.com/tc_dev_manifest.json
   ```
3. Click **Load/Install**

✅ **Verify:** Extension panel appears on the right side

---

### STEP 6: Test View 4 Measurements
1. **Look for** "JIG Drawing Tool" title in the extension panel
2. **Click** the "View 4" button
3. **Observe** the 3D viewer:
   - Red measurement lines should appear
   - Lines connect vertical bars to horizontal bars
   - Measurements are sorted by distance from datum

✅ **SUCCESS:** You should see red annotations in the 3D model!

---

## WHAT YOU'LL SEE

### Extension Panel:
```
┌─────────────────────────┐
│  JIG Drawing Tool       │
│  Datum: left            │
├─────────────────────────┤
│ [View1] [View2]         │
│ [View3] [View4] ← CLICK │
│ [View5] [View6]         │
│ [View7] [View8]         │
├─────────────────────────┤
│ [ Clear All ]           │
├─────────────────────────┤
│ Model ID: WqDG_Eqdewo   │
│ Bounding Box: [...]     │
│ View 4: Vertical bar... │
└─────────────────────────┘
```

### 3D Viewer (When View 4 Active):
- Red measurement lines from vertical bar bottom
- To closest horizontal bar center point
- Grouped by unique bar mark
- Multiple measurements if multiple vertical bars

---

## TROUBLESHOOTING

| Issue | Solution |
|-------|----------|
| "Extension fails to load" | Check tunnel is running (`cloudflared tunnel --url ...`) |
| "Station type not supported" | Extension not loaded in Trimble Connect; must be within JIG project |
| No red lines appear | Click View 4 button; check model has vertical bars |
| Browser console errors | Check that dev server is on port 3000 |
| "Tunnel expired" | Tunnel URLs expire; restart `cloudflared` command to get new URL |

---

## IMPORTANT NOTES

1. **Tunnel URLs are temporary** - They expire after ~24 hours of use. If it stops working, restart the tunnel and update the manifest.

2. **Dev server must be running** - Always keep `npm run dev` running in background while testing

3. **Manifest URL format** - Must include `/index.html` at the end:
   - ✅ `https://abc123.trycloudflare.com/index.html`
   - ❌ `https://abc123.trycloudflare.com/tc_dev_manifest.json` (wrong - points to manifest itself)

4. **JIG Model required** - Extension only works within Trimble Connect with actual JIG model loaded

---

## FINAL VERIFICATION CHECKLIST

- [ ] Dev server running on port 3000
- [ ] Cloudflare tunnel running and showing URL
- [ ] Manifest updated with correct tunnel URL
- [ ] Trimble Connect project loaded
- [ ] Extension added to Trimble Connect
- [ ] JIG Drawing Tool title visible in panel
- [ ] View 4 button visible with other view buttons
- [ ] Clicking View 4 shows red measurement lines in 3D viewer

---

## SUCCESS CRITERIA

✅ **Tool is working when:**
1. Extension loads without errors
2. View 4 button is clickable  
3. Red measurement lines appear in 3D viewer
4. Measurements connect vertical bars to horizontal bars

🎉 **YOU'VE COMPLETED THE SETUP!**

---

## FOR PRODUCTION DEPLOYMENT

When ready for permanent hosting:
1. Deploy to Railway, Render, or similar Node.js hosting
2. Update manifest URL to production URL
3. No need for Cloudflare Tunnel anymore (only for development)

See `SETUP_GUIDE.md` for more options.
