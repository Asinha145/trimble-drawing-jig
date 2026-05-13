# Modules & Components Guide — Trimble JIG Drawing Tool

## Overview

The codebase consists of **5 React components** and **8 utility modules**. This document explains each module's purpose, key functions, and interactions.

---

## React Components

### 1. **App.tsx** — Main Application Root
**Location:** `src/App.tsx`  
**Lines:** ~490

**Purpose:** Entry point for the entire application. Detects model type (VWS/HWS/JIG) and routes to appropriate component.

**Key Responsibilities:**
- Initialize Trimble Connect API via `ConnectViewer()`
- Scan model and extract ID via `GetModelID()`
- Detect station type from model name pattern
- Load station-specific data (rebars, plates, stringers, colours)
- Manage state for all three station types
- Render appropriate component based on station type

**Key Functions:**
```typescript
- useEffect() — 3000ms deferred initialization
- handleSelectVWS() — Annotate VWS assembly
- handleSelectHWS() — Annotate HWS assembly
- handleClearAll() — Reset viewer state
- colourHWSSpacers() — Apply semantic colors to HWS components
```

**State Variables:**
- `station_type` — "VWS" | "HWS" | "JIG Drawing Tool"
- `modelID` — Trimble model identifier
- `RebarList` — VWS vertical rebars
- `PlateList` — HWS profile plates
- `spacerColours` — Map of object ID → RGBA color

**Key Insight:** App.tsx handles BOTH VWS and HWS modes. JIG mode is delegated to JigPanel. This is a common structure for multi-mode applications.

---

### 2. **JigPanel.tsx** — JIG Visualization & View System
**Location:** `src/components/JigPanel.tsx`  
**Lines:** ~660

**Purpose:** Complete 9-view visualization system for JIG assemblies. Manages view switching, annotations, and dimension generation.

**Key Responsibilities:**
- Load JIG objects via `getJigObjects()`
- Extract datum from IFC properties
- Manage active view state (1–9)
- Generate view-specific colour groups
- Create dimension annotations per view
- Handle RTW selection (views 3 & 5)
- Handle bar selection (views 4 & 6)

**View System:**
```
View 1: Normal (semantic colors on all)
View 2: Pallet (PAL + PLT only)
View 3: VLB Assy (vertical loading bars)
View 4: Vert Bars (vertical measurements)
View 5: HSB Assy (horizontal stud bars)
View 6: Horiz Bars (horizontal measurements)
View 7: Soft Zone (SZN padding zones)
View 8: Lift Plates (LP3/LPS only)
View 9: COG (center of gravity)
```

**Key Functions:**
```typescript
handleViewClick(viewIndex) — Switch view + apply state + annotate
applyViewState() — Apply color groups to viewer
applyColourGroupsOnly() — Update colors without removing markups
annotateAllInView() — View-specific annotation logic
handleRTWSelect() — Highlight specific RTW assembly
handleBarSelect() — Highlight specific rebar
annotateAt() — Add text markup at position
addDim() — Add measurement dimension
```

**State Variables:**
- `loading` — Data fetching in progress
- `jigData` — JigData object (all scanned objects)
- `activeView` — Currently selected view (1–9)
- `selectedRTWLabel` — Currently focused RTW or bar

**Key Insight:** JigPanel uses a **smart annotation strategy**: View-specific logic is isolated in `annotateAllInView()` switch statement, making it easy to add new views.

---

### 3. **DataTableComponent.tsx** — VWS/HWS Parts Table
**Location:** `src/components/DataTableComponent.tsx`

**Purpose:** Display parts list for VWS and HWS modes.

**Key Functions:**
- Render BOM (Bill of Materials) table
- Handle row selection/highlighting
- Trigger annotation callbacks on row click

**Props:**
```typescript
{ Rebar, onSelect } // VWS mode
{ partRows, onSelect } // HWS mode
```

---

### 4. **BoundingBoxInfo.tsx** — Model Dimensions Display
**Location:** `src/components/BoundingBoxInfo.tsx`

**Purpose:** Show overall model bounding box dimensions (L×W×H).

**Props:**
```typescript
{ jigData: { boundingBox } }
```

**Display:**
- Width (X-axis)
- Height (Y-axis)
- Depth (Z-axis)

---

### 5. **BBSDataTable.tsx** — Bearing Box Specs Table
**Location:** `src/components/BBSDataTable.tsx`

**Purpose:** Display bearing box specifications.

---

## Utility Modules

### 1. **TCJigData.ts** — Core JIG Logic
**Location:** `src/module/TCJigData.ts`  
**Lines:** 1,150+

**Purpose:** Core JIG object scanning, hierarchy traversal, and all dimension builders.

**Key Types:**
```typescript
interface JigObject { /* object metadata */ }
interface JigData { /* scanned data + precomputed maps */ }
interface ViewGroup { /* color + visibility batch */ }
interface DimSegment { /* dimension endpoints */ }
type RGBA = { r, g, b, a }
type RTWFamily = 'VLBH' | 'VLBS' | ... // 10 types
```

**Key Functions:**

#### Core Scanning
```typescript
getJigObjects(API) → JigData
  • Resolves modelID
  • Fetches all objects
  • Gets properties per object
  • Gets bounding boxes per object
  • Traverses RTW hierarchy
  • Builds JigObject[]
  • Calculates overall bounding box
  • Returns 7-step scan result
```

**Property Extraction Path:**
```
Try: SolidWorks Custom Properties → bim2cam:Part Number
Fallback: Attributes.Name
Fallback: General.Name
Fallback: IFC Attributes.Name
Last resort: Scan all psets for Name property with '-' pattern
```

#### View Group Builders
```typescript
buildViewGroups(viewIndex, data) → ViewGroup[]
  • Semantic color mapping per view
  • Visibility toggling per view
  • Efficient batching by color
  
buildRTWFocusGroups(data, focusedRTWIds, familyCheck) → ViewGroup[]
  • Highlight selected RTW + children
  • Dim other components
  
buildView4FocusGroups(data, hotPinkIds) → ViewGroup[]
buildView6FocusGroups(data, hotPinkIds) → ViewGroup[]
  • Highlight selected bar
  • Dim unrelated components
```

#### Dimension Builders
```typescript
buildView4VerticalBarDimensions(data, datumX) → DimSegment[]
  • Vertical bar → horizontal bar center Z
  • Coupler-aware (MALE+BRIDGING detection)
  • Grouped by bar mark
  • Sorted by distance from datum

buildView6VerticalBarDimensions(data, datumX) → DimSegment[]
  • Horizontal bar → vertical bar center X
  • Coupler-aware
  • 2D horizontal plane only

buildView9COGDimensions(data, datumX) → { cogX, cogY, cogZ, vertDim, horizDim }
  • Combined center of gravity
  • Vertical + horizontal dimensions
  • Excludes SZN, PAL, PLT

buildVLBDimensions(rtw, strChildren, rebChildren) → DimSegment[]
buildHSBDimension(reb, strChildren, datumX) → DimSegment | null
  • RTW-specific measurement logic
```

#### Classifiers & Helpers
```typescript
classifyFamily(partNumber) → ObjectFamily
getRtwFamily(partNumber) → RTWFamily | undefined
isVerticalBar(bbox) → boolean
isVLBFamily(f) → boolean
isHSBAssemblyFamily(f) → boolean
isRebarFamily(f) → boolean
getRTWChildren(rtwId, objects) → JigObject[]
extractBarMark(partNumber) → string
```

**Color Palette:**
```typescript
RTW_COLOURS: Record<RTWFamily, RGBA>  // 10 colors
ANNOTATION_RED: (255,0,0)
HOT_PINK: (255,105,180)
PLT_RED, GREY_FULL, GREY_20, GREY_40, ORANGE_10, HIDDEN
```

**Key Algorithm: RTW Hierarchy Traversal**
```
For each RTW in model:
  Recursively gather all children
  Mark child with parent RTW ID
Result: rtwChildMap (childId → rtwId)
```

**Key Algorithm: Coupler-Aware Dimensions**
```
For each rebar:
  Extract coupler type from properties
  If MALE+BRIDGING:
    dimension_point = bbox.max - (rebarLength / 1000)
  Else:
    dimension_point = bbox.min or bbox.max
```

**Performance Notes:**
- ~2,000 objects typical model
- 10s for full scan (timeout protected at 2s per object)
- Map<id, object> for O(1) lookups instead of O(n) array searches

---

### 2. **TCEntryPoint.ts** — API Initialization
**Location:** `src/module/TCEntryPoint.ts`

**Purpose:** Initialize Trimble Connect Workspace API.

**Key Exports:**
```typescript
export const ConnectViewer = () => {
  // Initializes global API object
  // Sets up WebSocket connection
}

export const { ConnectViewer, API } = ...
  // Global API instance for use across app
```

---

### 3. **TCFixtureTable.ts** — Model Introspection
**Location:** `src/module/TCFixtureTable.ts`

**Purpose:** Extract VWS/HWS specific data (rebars, plates, stringers, station config).

**Key Functions:**
```typescript
GetModelID(API) → string
  • Identifies current model in Trimble Connect

GetRebarsVWS(API) → object[]
  • Extracts vertical rebars for VWS mode

getPlatesHWS(API) → object[]
  • Extracts profile plates for HWS

getSubAssembliesHWS(API, colours) → object[]
  • Extracts HWS sub-assemblies

getStationConfigHWS(API) → string
  • Gets station configuration name

getDatumSideHWS(API) → string
  // "EAST" | "WEST"

getOmittedStringers(API, stationType) → number[]
  // IDs of stringers marked as omitted

getStringerColours(API) → Map<number, RGBA>
  // Per-stringer color mapping
```

---

### 4. **BoundingBoxUtil.ts** — Geometry Calculations
**Location:** `src/module/BoundingBoxUtil.ts`

**Purpose:** Calculate overall model bounding box.

**Key Functions:**
```typescript
calculateModelBoundingBox(API) → BoundingBox | null
  • Scans all objects
  • Finds min/max per axis
  • Returns overall AABB

type BoundingBox = {
  min: { x, y, z },
  max: { x, y, z }
}
```

---

### 5. **ExtractAssembly.ts** — Assembly Extraction
Purpose: Extract assembly relationships (not actively used in JIG mode).

---

### 6. **ArrayObjectUtility.ts** — Array Helpers
Purpose: Utility functions for array operations.

---

### 7. **types.d.ts** — Type Definitions
**Location:** `src/components/types.d.ts`

**Purpose:** Shared TypeScript type definitions.

```typescript
interface datumItem {
  positionX: number;
  positionY: number;
  positionZ: number;
  label: string;
}

interface boundingBox {
  xMin, yMin, zMin,
  xMax, yMax, zMax: number;
}
```

---

### 8. **main.tsx** — Entry Point
**Location:** `src/main.tsx`

**Purpose:** React DOM mount point.

```typescript
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

---

## Module Dependencies Graph

```
App.tsx
├── TCEntryPoint.ts (ConnectViewer, API)
├── TCFixtureTable.ts (GetModelID, type detection)
├── BoundingBoxUtil.ts (calculateModelBoundingBox)
└── JigPanel.tsx
    ├── TCJigData.ts (getJigObjects, buildView*, buildVLB*, buildHSB*)
    │   ├── TCFixtureTable.ts (GetModelID)
    │   └── [type definitions from JigObject]
    ├── ArrayObjectUtility.ts (helper functions)
    └── [CSS modules for styling]

DataTableComponent.tsx
├── Types (datumItem, boundingBox)
└── [CSS modules]
```

---

## Key Design Patterns

### 1. **Timeout-Protected API Calls**
```typescript
const result = await withTimeout(promise, timeoutMs, label);
// Returns null if timeout exceeded
// Prevents hanging on slow/failed API responses
```

### 2. **Fallback Property Extraction**
```typescript
let value = getPropValue(props, 'primaryPset', 'propertyName');
if (!value) value = getPropValue(props, 'fallback1Pset', 'fallback1Name');
if (!value) value = getPropValue(props, 'fallback2Pset', 'fallback2Name');
// Handles multiple CAD formats (SolidWorks, CATIA, IFC)
```

### 3. **Map-Based Hierarchy Caching**
```typescript
const rtwById = new Map<number, JigObject>();
for (const o of objects) if (o.family === 'RTW') rtwById.set(o.id, o);
// Later: const parent = rtwById.get(childId);  // O(1) lookup
```

### 4. **Colour Batching for Performance**
```typescript
const groups = new Map<string, ViewGroup>();
const key = `${color.r}-${color.g}-${color.b}-${color.a}`;
if (!groups.has(key)) groups.set(key, { ids: [], colour, visible });
groups.get(key)!.ids.push(id);
// Result: 1 API call per color instead of 1 per object
```

### 5. **View-Specific Logic Isolation**
```typescript
switch(viewIndex) {
  case 2: // Pallet-specific logic
  case 3: // VLB-specific logic
  case 4: // Vertical bar measurement logic
  // ...etc
}
// Easy to add new views without affecting others
```

---

## Summary

| Module | Lines | Purpose | Key Export |
|--------|-------|---------|-----------|
| **App.tsx** | 490 | Main app root + VWS/HWS logic | App component |
| **JigPanel.tsx** | 660 | 9-view system + annotations | JigPanel component |
| **TCJigData.ts** | 1150 | Core JIG scanning + dimension builders | getJigObjects, build* functions |
| **TCEntryPoint.ts** | 50 | API initialization | ConnectViewer, API |
| **TCFixtureTable.ts** | 200 | VWS/HWS data extraction | GetModelID, GetRebarsVWS, etc. |
| **BoundingBoxUtil.ts** | 50 | Geometry calculations | calculateModelBoundingBox |

**Total: ~2,600+ lines of production code**

Each module follows **single-responsibility principle**: one concern per file, clear exports, minimal side effects.
