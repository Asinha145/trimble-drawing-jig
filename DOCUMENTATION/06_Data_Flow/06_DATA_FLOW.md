# Data Flow — Trimble JIG Drawing Tool

## 1. Application Startup Flow

```
┌─────────────────────────────────────────┐
│  User opens Trimble Connect in Browser   │
│  Loads JIG project with 3D model         │
└────────────────┬────────────────────────┘
                 │
                 ▼
        ┌─────────────────┐
        │  App.tsx mounted│
        │  (useEffect)    │
        └────────┬────────┘
                 │
         ┌───────▼────────┐
         │  setTimeout 3s  │
         │  (defer 3000ms) │
         └────────┬────────┘
                 │
        ┌────────▼────────────────┐
        │  ConnectViewer() called  │
        │  (TCEntryPoint.ts)       │
        │  Initializes API object  │
        └────────┬─────────────────┘
                 │
        ┌────────▼──────────────────────┐
        │  GetModelID(API)               │
        │  • Calls API.viewer.getModels()│
        │  • Extracts model ID           │
        │  • Returns: string modelId     │
        └────────┬──────────────────────┘
                 │
        ┌────────▼──────────────────────┐
        │  Detect Station Type           │
        │  Check model name for:         │
        │  • "VWS" → Vertical Weld       │
        │  • "HWS" → Horizontal Weld     │
        │  • Default → JIG Drawing       │
        └────────┬──────────────────────┘
                 │
            ┌────┴────┬───────┬──────┐
            │         │       │      │
         VWS        HWS      JIG    ERROR
            │         │       │      │
            │         │       ▼      │
            │         │    ┌─────────┘
            │         │    │
            ▼         ▼    ▼
      ┌──────┐  ┌──────┐  ┌──────────────┐
      │ VWS  │  │ HWS  │  │ JigPanel.tsx │
      │ Mode │  │ Mode │  │   (JIG Mode) │
      └──────┘  └──────┘  └──────┬───────┘
                                 │
                        ┌────────▼────────────┐
                        │  JigPanel useEffect │
                        │  (JIG initialization)│
                        └────────┬────────────┘
                                 │
                        ┌────────▼────────────┐
                        │ getJigObjects(API)  │
                        │  (TCJigData.ts)     │
                        └────────┬────────────┘
                                 │
                        ┌────────▼────────────────────┐
                        │  Step 1: GetModelID         │
                        │  Step 2: getObjects()       │
                        │  Step 3: getProperties()    │
                        │  Step 4: getBoundingBoxes() │
                        │  Step 5: getHierarchy()     │
                        │  Step 6: Calculate BBox     │
                        │  Step 7: Extract Datum      │
                        │  Result: JigData object     │
                        └────────┬────────────────────┘
                                 │
                        ┌────────▼──────────────┐
                        │ Render JigPanel UI    │
                        │ • 9 view buttons      │
                        │ • BOM table           │
                        │ • Clear button        │
                        └────────┬──────────────┘
                                 │
                        ┌────────▼──────────────┐
                        │ Ready for interaction │
                        │ (user clicks view)    │
                        └───────────────────────┘
```

---

## 2. JIG Object Scanning Process (getJigObjects)

```
Input: API object (Trimble Connect Workspace API)

Step 1: Resolve Model ID
├─ Call: API.viewer.getModels()
├─ Extract: first model's ID
└─ Output: modelID (string)

Step 2: Fetch Raw Object List
├─ Call: API.viewer.getObjects()
├─ Parse: [0].objects array
└─ Output: rawList = [{ id: number }, ...]

Step 3: For Each Object (Timeout Protected)
├─ Call: API.viewer.getObjectProperties(modelID, [objectId])
├─ Call: API.viewer.getObjectBoundingBoxes(modelID, [objectId])
├─ Extract:
│  ├─ partNumber (from properties)
│  ├─ scribeText (optional)
│  ├─ rebarLength (from CalculatedGeometryValues)
│  ├─ couplerType (IFC:Rebar:Coupler Type)
│  ├─ COG (Center of Gravity X/Y/Z)
│  └─ bbox (bounding box)
└─ Timeout: 2 seconds per object

Step 4: Property Extraction Fallback Chain
For part number:
1. Try: SOLIDWORKS Custom Properties → bim2cam:Part Number
2. Fallback: Attributes.Name
3. Fallback: General.Name
4. Fallback: IFC Attributes.Name
5. Scan all psets for Name with '-' separator
6. Default: empty string

Step 5: RTW Hierarchy Traversal
For each RTW object found:
├─ Call: API.viewer.getHierarchyChildren(modelID, [rtwId])
├─ Recursively call for each child
├─ Build: rtwChildMap (childId → parentRtwId)
└─ Output: rtwChildMap with all descendants

Step 6: Build JigObject Array
For each raw object:
├─ Classify family: classifyFamily(partNumber)
├─ Determine RTW family: getRtwFamily(partNumber)
├─ Set parent: rtwChildOf from rtwChildMap
├─ Determine orientation: isVerticalBar(bbox)
└─ Create JigObject with all metadata

Step 7: Calculate Overall Bounding Box
├─ Find: min X/Y/Z across all objects
├─ Find: max X/Y/Z across all objects
└─ Output: AABB { min, max }

Output: JigData {
  modelID,
  objects: JigObject[],
  rtwById: Map<number, JigObject>,
  boundingBox: AABB,
  datumValue?: string,
  datumX?: number
}
```

**Performance:**
- 2,000 objects → ~10 seconds (2ms per object average)
- Bottleneck: API.viewer.getHierarchyChildren() for RTWs

---

## 3. View Activation Flow (User Interaction)

```
User clicks: "View 4 (Vert Bars)" button
            │
            ▼
    handleViewClick(4)
            │
    ┌───────▼────────────┐
    │ Clear prior state   │
    │ removeMarkups()     │
    │ reset()             │
    └───────┬────────────┘
            │
    ┌───────▼──────────────────┐
    │ applyViewState(4, data)   │
    │                          │
    │ 1. buildViewGroups(4)    │
    │    └─ Return: ViewGroup[]│
    │       (color + visibility│
    │        batches)          │
    │                          │
    │ 2. For each group:       │
    │    setObjectState()      │
    │    (apply colors)        │
    └───────┬──────────────────┘
            │
    ┌───────▼────────────────────────────┐
    │ annotateAllInView(4, data)          │
    │                                    │
    │ case 4: Vertical Bars              │
    │ ├─ For each vertical REB:          │
    │ │  └─ annotateAt() [label]         │
    │ │     [text markup added]          │
    │ │                                  │
    │ └─ buildView4VerticalBarDimensions()
    │    ├─ Identify vertical bars       │
    │    ├─ Identify horizontal bars     │
    │    ├─ Find bottom horizontal bar   │
    │    ├─ For each vertical bar:       │
    │    │  ├─ Get bar bottom Z (coupler-aware)
    │    │  ├─ Get horizontal center Z   │
    │    │  └─ Create DimSegment         │
    │    └─ Return: DimSegment[]         │
    │                                    │
    │ ├─ For each dimension:             │
    │ │  └─ addDim() [measurement]       │
    │ │     [red line added to viewer]   │
    │                                    │
    └───────┬────────────────────────────┘
            │
    ┌───────▼──────────────────────┐
    │ 3D Viewer renders:            │
    │ • Colors applied              │
    │ • Objects hidden/shown        │
    │ • Text markups visible        │
    │ • Red dimension lines drawn   │
    └───────────────────────────────┘
```

---

## 4. Measurement Calculation Flow (View 4 Vertical Bars)

```
buildView4VerticalBarDimensions(data, datumX)
            │
            ▼
    Step 1: Identify Vertical Bars
    ├─ Filter: isVertical OR (rtwChildOf VLB)
    └─ Output: verticalBars: JigObject[]
    
            ▼
    Step 2: Identify Horizontal Bars
    ├─ Filter: NOT in verticalBars list
    └─ Output: horizontalBars: JigObject[]
    
            ▼
    Step 3: Find Bottommost Horizontal Bar
    ├─ Scan: all horizontalBars
    ├─ Find: min Z value
    └─ Output: bottomHorizBar, horizCogZ
    
            ▼
    Step 4: Group Vertical Bars by Mark
    ├─ Extract: mark from part number (last segment)
    ├─ Group: bars with same mark
    └─ Output: Map<mark, JigObject[]>
    
            ▼
    Step 5: For Each Bar Mark
    ├─ Sort: bars by distance from datum
    ├─ Select: closest bar (bars[0])
    │
    ├─ Get: bar center (cogX, cogY)
    │
    ├─ Determine: bar bottom Z
    │   ├─ If MALE+BRIDGING:
    │   │  └─ bottomZ = bbox.max.z - (rebarLength / 1000)
    │   │     [coupler excluded]
    │   │
    │   └─ Else:
    │      └─ bottomZ = bbox.min.z
    │         [standard position]
    │
    └─ Create: DimSegment
       ├─ start: (cogX, cogY, bottomZ)
       ├─ end:   (cogX, cogY, horizCogZ)
       └─ axis:  Z (pure vertical)
    
            ▼
    Step 6: Return DimSegment[]
    └─ All vertical bar dimensions grouped by mark
```

**Example:**
```
Model contains:
• REB-3027 (vertical, bbox: z=[100,200])
• REB-3028 (vertical, bbox: z=[100,200], MALE+BRIDGING, rebarLength=90)
• REB-4001 (horizontal, bbox: z=[50,75])

Datum = left (datumX = 0)

View 4 calculates:
┌─ Mark 3027:
│  ├─ bottomZ = 100 × 1000 = 100mm
│  ├─ horizZ = (50+75)/2 × 1000 = 62.5mm
│  └─ Dimension: 100mm → 62.5mm (vertical)
│
└─ Mark 3028:
   ├─ bottomZ = (200 - 90/1000) × 1000 = 110mm [coupler excluded]
   ├─ horizZ = 62.5mm
   └─ Dimension: 110mm → 62.5mm (vertical)
```

---

## 5. State Management & Re-render Flow

```
JigPanel Component State Tree

jigData: JigData
├─ modelID
├─ objects: JigObject[]
├─ rtwById: Map<id, JigObject>
├─ boundingBox: AABB
├─ datumValue: "left" | "right"
└─ datumX: number

activeView: ViewIndex (1-9)
├─ Used by: applyViewState(), annotateAllInView()
├─ Updated on: handleViewClick()
└─ Effect: Full re-annotation of viewer

selectedRTWLabel: string | null
├─ Used by: highlight focus groups
├─ Updated on: handleRTWSelect(), handleBarSelect()
└─ Effect: Partial color update (no markup change)

loading: boolean
├─ Set by: useEffect during initialization
└─ Effect: Show "Loading..." while fetching JigData

┌────────────────────────────────────┐
│  User clicks view button            │
│  activeView state changes           │
│  Component re-renders               │
│  useEffect NOT triggered            │
│  Markup is cleared + re-annotated   │
│  Colors applied                     │
│  Dimensions redrawn                 │
└────────────────────────────────────┘
```

---

## 6. Data Size & Performance Metrics

| Operation | Input Size | Time | Bottleneck |
|-----------|-----------|------|-----------|
| **Scan objects** | 2,000 objects | ~10s | API.getObjectProperties (2ms each) |
| **Get hierarchy** | 100 RTWs | ~2s | API.getHierarchyChildren (20ms each) |
| **Build view groups** | 2,000 objects | ~50ms | Map iteration + color batching |
| **Generate View 4 dims** | 200 vertical bars | ~100ms | Geometry calculations + grouping |
| **View switch** | 2,000 objects | ~200ms | setObjectState API calls (batched) |
| **Apply markup** | 200 dimensions | ~500ms | API.addMeasurementMarkups (1 call) |
| **Total flow (View 1→4)** | Start to render | ~2.5s | API latency dominates |

---

## 7. Error Handling Data Flow

```
User triggers operation
        │
        ▼
  withTimeout(promise, 2000ms)
    │
    ├─ Race promise vs 2s timer
    │
    ├─ Promise resolves → return result
    │
    └─ 2s timeout → return null
       │
       ▼
    Check result for null
    │
    ├─ If null → Log warning, use fallback
    │  ├─ Datum: use bbox.min.x instead
    │  ├─ Part#: mark as ""
    │  └─ Continue processing
    │
    └─ If success → use actual result
```

**Fallback Chains:**
```
Part Number Extraction:
1. SolidWorks Props → success? return
2. Attributes.Name → success? return
3. General.Name → success? return
4. IFC Attrs.Name → success? return
5. Scan all → success? return
6. Default → ""

Coupler Type:
1. SOLIDWORKS Props → found? return
2. Default → "MALE"

Datum:
1. Properties → found? return
2. BBox min.x → use as fallback
```

---

## Summary

The **Trimble JIG Drawing Tool** implements a **clean, layered data flow**:

1. **Initialization** → App root detects mode, initializes API
2. **Scanning** → JigPanel deeply scans model (hierarchies, properties, geometry)
3. **Preparation** → Pre-computes maps (rtwById), bounding box, datum
4. **Interaction** → User clicks view, triggers applyViewState + annotateAllInView
5. **Visualization** → Viewer receives color state + markups
6. **Error Handling** → Timeouts protect API calls, fallbacks handle missing data

Each layer is **independent**, **testable**, and **resilient** to missing or slow API responses.
