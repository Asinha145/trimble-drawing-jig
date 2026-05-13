# System Architecture — Trimble JIG Drawing Tool

## High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Trimble Connect Extension                     │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      App.tsx (Root)                      │   │
│  │  • Model type detection (VWS/HWS/JIG)                   │   │
│  │  • Station configuration loading                         │   │
│  │  • API initialization & lifecycle                        │   │
│  └─────────────┬────────────────────────────────────────────┘   │
│                │                                                  │
│        ┌───────▼─────────┐                                       │
│        │  Station Type?  │                                       │
│        └─┬─────────┬────┬┘                                       │
│          │         │    │                                        │
│    ┌─────▼──┐ ┌───▼─┐ ┌▼────────┐                               │
│    │  VWS   │ │ HWS │ │ JigPanel│                               │
│    │Component│ │Comp.│ │ (9Views)│                               │
│    └────────┘ └─────┘ └────┬────┘                               │
│                            │                                     │
│           ┌────────────────▼────────────────┐                   │
│           │     JIG Visualization Engine    │                   │
│           │                                 │                   │
│           │ • View state management         │                   │
│           │ • Color group building          │                   │
│           │ • Annotation orchestration      │                   │
│           │ • Measurement calculation       │                   │
│           └────────┬──────────┬──────┬─────┘                   │
│                    │          │      │                          │
│        ┌───────────▼┐ ┌──────▼──┐ ┌─▼─────────────┐            │
│        │ TCJigData  │ │JigData  │ │   Dimensions │            │
│        │ • Object   │ │Builder  │ │   • View 4   │            │
│        │   scanning │ │ • View  │ │   • View 6   │            │
│        │ • RTW      │ │   groups│ │   • View 9   │            │
│        │   hierarchy│ │ • Focus │ └─────────────┘            │
│        │           │ │   groups│                              │
│        └───────────┘ └────────┘                               │
│                                                                  │
│           ┌────────────────────────────────────┐               │
│           │  Trimble Connect Workspace API     │               │
│           │  • getObjects()                    │               │
│           │  • getObjectProperties()           │               │
│           │  • getObjectBoundingBoxes()        │               │
│           │  • getHierarchyChildren()          │               │
│           │  • setObjectState()                │               │
│           │  • addMeasurementMarkups()         │               │
│           │  • addTextMarkup()                 │               │
│           └────────────────────────────────────┘               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Architecture

### Initialization Flow

```
User opens Trimble Connect + loads JIG model
          │
          ▼
   App.tsx mounted
   (useEffect triggered)
          │
          ▼
   ConnectViewer() initialization
          │
          ├─── Wait 3000ms for API readiness
          │
          ▼
   GetModelID(API)
          │
          ├─── Scan model objects
          ├─── Extract model ID
          ▼
   Detect Station Type (VWS/HWS/JIG)
          │
    ┌─────┼────┬──────┐
    │     │    │      │
   VWS   HWS  JIG   ERROR
    │     │    │      │
    └─────┴────┼──────┘
         ▼
   If JIG: JigPanel.tsx mounted
         │
         ▼
   JigPanel useEffect: getJigObjects()
         │
         ├─── GetModelID
         ├─── getObjects() [raw list]
         ├─── getObjectProperties() [for each]
         ├─── getObjectBoundingBoxes() [for each]
         ├─── getHierarchyChildren() [for each RTW]
         │
         ▼
   Build JigData:
   • JigObject[] with families
   • RTW hierarchy map
   • Bounding box calculations
   • Datum extraction
         │
         ▼
   Render JigPanel with 9 view buttons
```

### View Activation Flow

```
User clicks View N button
         │
         ▼
   handleViewClick(viewIndex)
         │
         ├─── API.markup.removeMarkups() [clear prior]
         ├─── API.viewer.reset()
         │
         ▼
   applyViewState(viewIndex, JigData)
         │
         ├─── buildViewGroups(viewIndex, data)
         │    [semantic colors per view]
         │
         ├─── For each ViewGroup:
         │    └─── API.viewer.setObjectState()
         │         [apply color + visibility]
         │
         ▼
   annotateAllInView(viewIndex, data)
         │
         ├─── View-specific annotation logic
         │    (View 3: RTW labels only)
         │    (View 4: + vertical bar dims)
         │    (View 5: HSB RTW detail)
         │    (View 6: + horizontal bar dims)
         │    (View 9: COG mark + dims)
         │
         ├─── For each annotation:
         │    └─── API.markup.addTextMarkup()
         │
         ├─── For each dimension:
         │    └─── API.markup.addMeasurementMarkups()
         │
         ▼
   3D Viewer displays result
   (colors applied, text visible, dims drawn)
```

### Measurement Calculation Flow (View 4 Example)

```
User clicks View 4 (Vertical Bars)
         │
         ▼
   buildView4VerticalBarDimensions(data, datumX)
         │
         ├─── Identify vertical bars
         │    (isVertical=true OR rtwChildOf VLB)
         │
         ├─── Identify horizontal bars
         │    (all other REBs)
         │
         ├─── Find bottommost horizontal bar
         │    (min Z value)
         │
         ├─── For each vertical bar mark:
         │    ├─── Extract mark from part number
         │    ├─── Get closest bar to datum
         │    │
         │    ├─── Determine bar bottom (Z):
         │    │    If MALE+BRIDGING:
         │    │       bottom = bbox.max.z - rebarLength
         │    │    Else:
         │    │       bottom = bbox.min.z
         │    │
         │    ├─── Get horizontal bar center Z
         │    │
         │    └─── Create DimSegment:
         │         start: (barCogX, barCogY, barBottomZ)
         │         end:   (barCogX, barCogY, horizCenterZ)
         │              [pure Z-axis dimension]
         │
         ▼
   Return DimSegment[]
         │
         ▼
   For each segment:
   └─── API.markup.addMeasurementMarkups(segment, RED)
```

---

## Module Interaction Map

### Core Modules

| Module | Purpose | Key Functions |
|--------|---------|---------------|
| **TCJigData.ts** | JIG object scanning & dimension builders | `getJigObjects()`, `buildView4VerticalBarDimensions()`, `buildViewGroups()` |
| **JigPanel.tsx** | View management & annotation UI | `handleViewClick()`, `annotateAllInView()`, `applyViewState()` |
| **TCFixtureTable.ts** | Model introspection for VWS/HWS | `GetModelID()`, `GetRebarsVWS()`, `getPlatesHWS()` |
| **TCEntryPoint.ts** | Workspace API initialization | `ConnectViewer()` |
| **BoundingBoxUtil.ts** | Geometry calculations | `calculateModelBoundingBox()` |

### Data Dependencies

```
App.tsx
  ├─ TCEntryPoint.ts (ConnectViewer)
  ├─ TCFixtureTable.ts (GetModelID, station detection)
  └─ JigPanel.tsx
       ├─ TCJigData.ts (getJigObjects)
       │  ├─ TCFixtureTable.ts (GetModelID)
       │  └─ API hierarchy traversal
       ├─ buildViewGroups() [from TCJigData]
       ├─ buildView4VerticalBarDimensions() [from TCJigData]
       ├─ buildView6VerticalBarDimensions() [from TCJigData]
       └─ buildView9COGDimensions() [from TCJigData]
```

---

## Object Hierarchy & Classification

### JigObject Type System

```typescript
interface JigObject {
  id: number;                    // Runtime object ID
  partNumber: string;            // From IFC properties
  family: ObjectFamily;          // Classified by part number
  rtwFamily?: RTWFamily;         // If RTW: VLBH, VLBS, VLBC, HLBU, HLBL, HLCU, MLS, HSB, MLL, MLU
  rtwChildOf?: number;           // Parent RTW ID if nested
  scribeText?: string;           // Scribed annotations
  bbox?: AABB;                   // Bounding box (meters)
  isVertical?: boolean;          // Rebar orientation
  rebarLength?: number;          // Actual bar length (mm)
  couplerType?: string;          // MALE+BRIDGING, FEMALE+BRIDGING, etc.
  cogX/Y/Z?: number;            // Center of gravity (meters)
}

type ObjectFamily = 'PLT' | 'PAL' | 'SZN' | 'REB' | 'REJ' | 'RB2' | 'STR' | 'LP' | 'WRA' | 'WST' | 'RTW' | 'OTHER';
type RTWFamily = 'VLBH' | 'VLBS' | 'VLBC' | 'HLBU' | 'HLBL' | 'HLCU' | 'MLL' | 'MLU' | 'HSB' | 'MLS';
```

### Color Palette System

```
RTW_COLOURS map:
┌──────────┬────────────────┐
│ VLBH     │ Red (255,0,0)  │
│ VLBS     │ Yellow         │
│ VLBC     │ Light Pink     │
│ HLBU     │ Green          │
│ HLBL     │ Magenta        │
│ HLCU     │ Dark Red       │
│ MLS      │ Yellow         │
│ HSB      │ Blue           │
│ MLL/MLU  │ Yellow         │
└──────────┴────────────────┘

Special Colors:
ANNOTATION_RED: (255,0,0) for dimension text
HOT_PINK: (255,105,180) for selected components
PLT_RED: (255,0,0) for plates
GREY (40/20): For background/dimmed components
```

---

## API Integration Points

### Trimble Connect Workspace API Usage

```typescript
// 1. Object Discovery
API.viewer.getObjects()                 // Get all objects in model
API.viewer.getObjectProperties(modelId, [objectIds])  // Fetch properties
API.viewer.getObjectBoundingBoxes(modelId, [objectIds])  // Get 3D bounds

// 2. Hierarchy Traversal
API.viewer.getHierarchyChildren(modelId, [parentIds])  // Get children

// 3. Visualization
API.viewer.setObjectState(selector, state)  // Color + visibility
API.viewer.setSelection(selector, "set")    // Highlight objects
API.viewer.setCamera(selector)              // Zoom to objects
API.viewer.reset()                          // Clear all state

// 4. Annotation
API.markup.addTextMarkup(textMarkups)       // Add labels
API.markup.addMeasurementMarkups(dims)      // Add dimensions
API.markup.removeMarkups()                  // Clear markups

// 5. Extension
API.extension.requestFocus()                // Bring extension to front

// 6. Model Identification
API.viewer.getModels()  [if available]      // List loaded models
```

---

## Error Handling Strategy

### Timeout Protection

```typescript
const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T | null> => {
  // Races promise against timeout
  // Returns null if timeout exceeded
  // Logs warnings for debugging
}

Usage:
- GetModelID: 10 second timeout
- getObjectProperties: 2 second timeout per object
- getObjectBoundingBoxes: 2 second timeout per object
- getHierarchyChildren: 2 second timeout per call
```

### Fallback Logic

```
Datum Extraction:
1. Try: Extract from JigDatum property set
2. Fallback: Use bounding box min.x (left datum)
3. Error: Log warning, continue with fallback

Part Number Extraction:
1. Try: SolidWorks Custom Properties
2. Try: Attributes.Name
3. Try: General.Name
4. Try: IFC Attributes.Name
5. Scan all psets for Name property
6. Error: Mark as empty string, continue

Coupler Detection:
1. Try: IFC:Rebar:Coupler Type on Short Leg
2. Try: IFC:Rebar:Coupler Type
3. Fallback: Assume MALE (default)
```

---

## View State Management

### View Groups & Colour Batching

```typescript
interface ViewGroup {
  ids: number[];           // Runtime object IDs to apply state to
  colour: RGBA;           // Color to apply (r,g,b,a)
  visible: boolean;       // Visibility flag
}

// Efficiency: Group IDs by color to minimize setObjectState() calls
// Example: 10 red objects + 15 blue objects = 2 API calls (not 25)

buildViewGroups() returns:
Map<colorKey, ViewGroup>
  → Deduplicates identical colors
  → Batches objects for single API call per color
```

---

## Dimension System Architecture

### 3-View Measurement Strategy

| View | Axis | Logic |
|------|------|-------|
| **View 4** | Z (vertical) | Bar bottom → horizontal bar center Z |
| **View 6** | X (horizontal) | Bar end (datum-closest) → vertical bar center X |
| **View 9** | Both | Combined COG with X and Z dimensions |

### Coupler-Aware Dimension Calculation

```
MALE+BRIDGING Detection:
┌─────────────────────────────┐
│  Rebar bbox: [0, 100]       │  bbox includes coupler
│  rebarLength: 75            │  actual bar length
│  Coupler extends beyond bar │
└─────────────────────────────┘
         │
         ▼
   If MALE+BRIDGING:
      dimension_point = bbox.max - (rebarLength / 1000)
         │
         └─→ Excludes coupler from measurement

   Else (FEMALE+BRIDGING, MALE, FEMALE, or none):
      dimension_point = bbox.min or bbox.max (standard)
         │
         └─→ Uses full bounding box
```

---

## Performance Optimization Techniques

1. **Lazy Property Extraction** — Fetch properties only once during initial scan
2. **Timeout-Protected Calls** — Prevent hanging on slow/failed API responses
3. **Batch Colour Grouping** — Combine IDs with same color to reduce API calls
4. **Map-Based Lookups** — Use Map<id, object> instead of array.find() for RTW parents
5. **Memoized Calculations** — Re-use bar families, bounds, and geometry computations
6. **Defer Datum Extraction** — Wait 800ms for parent App to set modelName before JigPanel processes

---

## Deployment & Integration

### Extension Manifest

```json
{
    "title": "ARMF",
    "url": "https://b0605f08.trimble-jig.pages.dev/index.html",
    "enabled": true,
    "type": "page"
}
```

### Build Pipeline

```
Source Code (GitHub)
    ↓
npm run build (Vite)
    ↓
dist/ folder (TypeScript → JavaScript, CSS bundling)
    ↓
Cloudflare Pages (auto-deployment on push)
    ↓
https://b0605f08.trimble-jig.pages.dev (live)
```

---

## Summary

The **Trimble JIG Drawing Tool** uses a **three-tier architecture**:

1. **Presentation Layer** — React components (App, JigPanel, DataTableComponent)
2. **Logic Layer** — TCJigData, dimension builders, view group generators
3. **Integration Layer** — Trimble Connect Workspace API + Markup API

Data flows **top-down** on initialization, then **event-driven** on user interaction. API calls are **timeout-protected** and **fallback-safe**. The system is **modular**, **efficient**, and **production-ready**.
