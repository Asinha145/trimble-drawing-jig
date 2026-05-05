
import { useState, useEffect } from 'react';
import './App.css';
import { DataTableComponentVWS, DataTableComponentHWS } from './components/DataTableComponent';
import { JigPanel } from './components/JigPanel';
import { ConnectViewer, API } from './module/TCEntryPoint';
import { GetModelID, modelName, GetRebarsVWS, getPlatesHWS, getSubAssembliesHWS, getStationConfigHWS, getDatumSideHWS, getOmittedStringers, getStringerColours } from './module/TCFixtureTable';
import type { ObjectSelector, IModelEntities, HierarchyType, HierarchyEntity, ObjectState } from 'trimble-connect-workspace-api';
import {datumItem, boundingBox} from './components/types';
import { start } from 'repl';
import { get } from 'http';

function App() {
  const [RebarList, setSubAssemblyList] = useState<any[]>([]);
  const [PlateList, setPlateList] = useState<any[]>([]);
  const [subAssemblyListHWS, setSubAssemblyListHWS] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modelID, setModelID] = useState<string>("");
  const [datumList, setDatumList] = useState<{ positionX: number; positionY: number; positionZ: number; label: string }[]>([]);
  const [_modelName, setModelName] = useState<string>("");
  const [station_type, setStation_type] = useState<string>("");
  const [station_Config, setStation_Config] = useState<any>("");
  const [datumSide, setDatumSide] = useState<string>("");
  const [omittedStringers, setOmittedStringers] = useState<any[]>([]);
  const [spacerColours, setSpacerColours] = useState<{ [key: number]: { r: number; g: number; b: number; a: number } }>({});

useEffect(() => {
  console.log("🔵 App.tsx: Initializing...");
  ConnectViewer();

  setTimeout(async function () {
    try {
      console.log("🔵 App.tsx: Getting model ID...");
      const id = await GetModelID(API);
      console.log("🔵 App.tsx: Got model ID:", id);
      console.log("🔵 App.tsx: Model name:", modelName);

      setModelID(id);
      const sliceIndex = modelName[5] === "-" ? 5 : 6;

      if (modelName.includes("VWS")) {
        console.log("🟢 Detected: Vertical Weld Station");
        await API.extension.requestFocus();
        setModelName(modelName.slice(0, 6));
        setStation_type("Vertical Weld Station");
        setModelName(modelName.slice(0, sliceIndex));
        const getRebars = await GetRebarsVWS(API);
        setSubAssemblyList(getRebars);

        setOmittedStringers(await getOmittedStringers(API, "Vertical Weld Station"));
      }
      else if (modelName.includes("HWS")) {
        console.log("🟢 Detected: Horizontal Weld Station");
        await API.extension.requestFocus();

        setModelName(modelName.slice(0, sliceIndex));
        setStation_type("Horizontal Weld Station");

        // Preload other HWS data in parallel (optional, faster)
        const [stationConfig, plates, datumSide, omitted] = await Promise.all([
          getStationConfigHWS(API),
          getPlatesHWS(API),
          getDatumSideHWS(API),
          getOmittedStringers(API),
        ]);
        setStation_Config(stationConfig);
        setPlateList(plates);
        setDatumSide(datumSide);
        setOmittedStringers(omitted);

        // Get colours, then use the local 'colours' variable (not the state yet)
        const colours = await getStringerColours(API);
        setSpacerColours(colours); // schedule state update

        // Use the freshly resolved colours for downstream work in this tick
        const subAssemblies = await getSubAssembliesHWS(API, colours);
        setSubAssemblyListHWS(subAssemblies);

        await colourHWSSpacers(colours);
      }
      else {
        // Default to JIG Drawing Tool
        console.log("🟡 Defaulting to: JIG Drawing Tool (no VWS/HWS detected)");
        await API.extension.requestFocus();
        setStation_type("JIG Drawing Tool");
      }

      console.log("🟢 App.tsx: Loading complete, station_type set");
      setLoading(false);
    } catch (error) {
      console.error("❌ Error initializing app:", error);
      console.log("🟡 Falling back to JIG Drawing Tool");
      setStation_type("JIG Drawing Tool");
      setLoading(false);
    }
  }, 3000);
}, []);

  const markNumberStyle = { fontSize: '20px', color: 'black' };


// Types from Trimble Connect Workspace API
// ColorRGBA uses 0–255 for all components (including alpha).
type RGBA = { r: number; g: number; b: number; a: number };

const colourHWSSpacers = async (spacerColours: Map<number, RGBA> | { [id: number]: RGBA }) => {
  // Optional: clear any existing markups you added elsewhere
  await API.markup.removeMarkups();

  // Your helper that returns the currently loaded model id (you already use this)
  const modelId = await GetModelID(API);

  // ---- Group ids by colour to minimize setObjectState calls ----
  // Key format "r-g-b-a" so identical colours are batched together.
  const groups = new Map<string, { color: RGBA; ids: number[] }>();

  const addPair = (id: number, color: RGBA) => {
    if (!Number.isFinite(id)) return;
    const key = `${color.r}-${color.g}-${color.b}-${color.a}`;
    const g = groups.get(key);
    if (g) g.ids.push(id);
    else groups.set(key, { color, ids: [id] });
  };

  if (spacerColours instanceof Map) {
    for (const [id, color] of spacerColours.entries()) addPair(id, color);
  } else {
    for (const [idStr, color] of Object.entries(spacerColours)) {
      addPair(Number(idStr), color as RGBA);
    }
  }

  // ---- Apply colour per batch using ViewerAPI.setObjectState ----
  for (const { color, ids } of groups.values()) {
    if (!ids.length) continue;

    // Build the ObjectSelector using runtime ids for this model.
    const selector: ObjectSelector = {
      modelObjectIds: [
        {
          modelId,               // File.versionId for model files in Connect
          objectRuntimeIds: ids, // the runtime ids you collected
        },
      ],
    };

    // Build ObjectState: set color & ensure visible.
    // ColorRGBA expects 0–255 for r,g,b,a (TC Workspace API).
    const state: ObjectState = {
      color: { r: color.r, g: color.g, b: color.b, a: color.a },
      visible: true, //      visible: true, // ensure the object is shown when colour is applied
    };
console.log("Applying colour ", color, " to ids ", ids);
    await API.viewer.setObjectState(selector, state);
  }

}






  // ✅ Selection + Annotation
  const handleSelectVWS = async (objectId: number, _matchingDatum: datumItem) => {
    if (!modelID) {
      console.error("Model ID not initialized yet.");
      return;
    }
    await API.markup.removeMarkups();

    // 1️⃣ Select the object
    const selector: ObjectSelector = {
      modelObjectIds: [{ modelId: modelID, objectRuntimeIds: [objectId] }]
    };
    API.viewer.setSelection(selector, "set"); //this is selecting the sub assembly as a whole, there is no way to access the internal parts of the assembly
    API.viewer.setCamera(selector);
const entitiesToIsolate: IModelEntities[] = [
  {
    entityIds: [objectId], // Replace with actual entity IDs
    modelId: modelID // Replace with your model ID
  }
];

const heirarchyChildren: HierarchyEntity[] = await API.viewer.getHierarchyChildren(modelID, [objectId]);

const objectIDList: any[] = [];
for (const child of heirarchyChildren) {
  const objectName = child.name;
  if (objectName.includes("REB") || objectName.includes("STR")) {
  objectIDList.push(child.id);
}
}
objectIDList.push(objectId); //also add the parent assembly id
let stringerboundingBox: boundingBox[] = [];
let yComponent: number = 0;

//need to assess if the stringer bounding boxes are very close or overlapping to decide how many stringers to dimension

for (const child of objectIDList) {
    // 3️⃣ Get properties for annotation
    const objectData = await API.viewer.getObjectProperties(modelID, [child]);
    const boundingBox = await API.viewer.getObjectBoundingBoxes(modelID, [child]); 
    let cogX: number = ((boundingBox[0].boundingBox.min.x + boundingBox[0].boundingBox.max.x)/2)*1000;
    let cogY: number = ((boundingBox[0].boundingBox.min.y + boundingBox[0].boundingBox.max.y)/2)*1000;
    let cogZ: number = ((boundingBox[0].boundingBox.min.z + boundingBox[0].boundingBox.max.z)/2)*1000;

const customProps = objectData[0]?.properties?.find((p: any) => p.name === "SOLIDWORKS Custom Properties");
    let partNumber: string = customProps?.properties.find((p: any) => p.name.includes("bim2cam:Part Number"))?.value ?? "N/A";
    let shapeCode: string = customProps?.properties.find((p: any) => p.name.includes("IFC:Rebar:Shape Code"))?.value ?? "N/A";
    if (partNumber.includes("STR")) {
        stringerboundingBox.push({
          xMin: boundingBox[0].boundingBox.min.x*1000,
          yMin: boundingBox[0].boundingBox.min.y*1000,
          zMin: boundingBox[0].boundingBox.min.z*1000,
          xMax: boundingBox[0].boundingBox.max.x*1000,
          yMax: boundingBox[0].boundingBox.max.y*1000,
          zMax: boundingBox[0].boundingBox.max.z*1000
        });
    }
    yComponent = cogY;
        let colour = { r: 255, g: 0, b: 0, a: 255 }
    if (partNumber.includes("RTW") || partNumber.includes("RT2")) {
      cogX = boundingBox[0].boundingBox.max.x*1000;
      colour = { r: 50, g: 50, b: 50, a: 255 }
    }
    else if (partNumber.includes("REB") || partNumber.includes("RB2")) {
 cogX = boundingBox[0].boundingBox.min.x*1000;
    }


let BBXMin: number = boundingBox[0].boundingBox.min.x ?? 0;
let BBYMin: number = boundingBox[0].boundingBox.min.y ?? 0;
let BBZMin: number = boundingBox[0].boundingBox.min.z ?? 0;
let BBXMax: number = boundingBox[0].boundingBox.max.x ?? 0;
let BBYMax: number = boundingBox[0].boundingBox.max.y ?? 0;
let BBZMax: number = boundingBox[0].boundingBox.max.z ?? 0;



    let startPosition: any = { positionX: cogX, positionY: cogY, positionZ: cogZ };
    let endPosition: any = { positionX: cogX, positionY: cogY+100, positionZ: cogZ };

    
  if (partNumber.includes("RTW") || partNumber.includes("RT2")) {
  await API.markup.addTextMarkup([{ start: startPosition, end: endPosition, text: partNumber + "\n" + " Fixture position: " + _matchingDatum.label, color:  colour}]);
  }
  else{
    console.log("Child ID: ", child, "Omitted stringers: ", omittedStringers);
  if (omittedStringers.includes(child)) {
    partNumber += " - Omitted Stringer \n Do not place in fixture";
    colour = { r: 255, g: 0, b: 0, a: 255 };
    }
  else if ((partNumber.includes("REB") || partNumber.includes("RB2")) && shapeCode.includes("B")) {
     partNumber += "\n Remove Bridging Coupler(s)";
  }
await API.markup.addTextMarkup([{ start: startPosition, end: endPosition, text: partNumber, color:  colour}]);
  }
  }

  let smallestX: any;
// First: sort by min X
stringerboundingBox.sort((a, b) => a.xMin - b.xMin);
// Now filter based on overlap and gap rules
const filtered: typeof stringerboundingBox = [];

for (let i = 0; i < stringerboundingBox.length; i++) {
    const current = stringerboundingBox[i];

    if (i === 0) {
        filtered.push(current);
        continue;
    }

    const previous = stringerboundingBox[i - 1];  // <-- compare to actual previous
    const clashes = current.xMin < previous.xMax;
    const gap = current.xMin - previous.xMax;

    if (!(clashes || gap < 3)) {
        filtered.push(current);
    }
}
const colours = [
  { r: 255, g: 0,   b: 0,   a: 255 }, // red
  { r: 0,   g: 255, b: 0,   a: 255 }, // green
  { r: 0,   g: 0,   b: 255, a: 255 }, // blue
  { r: 255, g: 255, b: 0,   a: 255 }, // yellow
  { r: 255, g: 0,   b: 255, a: 255 }, // magenta
  { r: 0,   g: 255, b: 255, a: 255 }, // cyan
];

let colorIndex = 0;

if (_matchingDatum) {

    for (let i = 0; i < filtered.length; i++) {
        const box = filtered[i];

        const startX = i === 0 ? _matchingDatum.positionX : filtered[i - 1].xMax; // start from previous xMax or datum
        const endX = box.xMin; // always end at current box xMin
        const zComponent = box.zMin;

        const color = colours[colorIndex % colours.length]; 
        //colorIndex++;  // move to next colour

        await API.markup.addMeasurementMarkups([
            {
                start: {
                    positionX: startX,
                    positionY: _matchingDatum.positionY,
                    positionZ: zComponent
                },
                end: {
                    positionX: endX,
                    positionY: _matchingDatum.positionY,
                    positionZ: zComponent
                },
                color
            }
        ]);
    }

} else {
    console.log("No datum found within tolerance.");
}


};

  // ✅ Clear All button handler
  const handleClearAll = () => {
    API.viewer.setSelection({ modelObjectIds: [] }, "set");
    API.viewer.reset();
    if (station_type === "Horizontal Weld Station") {
      colourHWSSpacers(spacerColours);
    }
    
  };

    // ✅ Clear All button handler
  const handleSelectPlates = async () => {
    await API.markup.removeMarkups();
    for (const plate of PlateList) {
    await API.markup.addTextMarkup([{ start: plate.dimensionStart, end: plate.dimensionEnd, text: plate.Name, color:  { r: 255, g: 0,   b: 0,   a: 255 }}]);
    }
    
  };

const handleSelectHWS = async (objectId: number[]) => {
if (!modelID) {
      console.error("Model ID not initialized yet.");
      return;
    }
    await API.markup.removeMarkups();
    // 1️⃣ Select the object
    const selector: ObjectSelector = {
      modelObjectIds: [{ modelId: modelID, objectRuntimeIds: objectId }]
    };

    API.viewer.setSelection(selector, "set"); //this is selecting the sub assembly as a whole, there is no way to access the internal parts of the assembly
    API.viewer.setCamera(selector);

    for (const id of objectId) {
    const objectData = await API.viewer.getObjectProperties(modelID, [id]);
    const customProps = objectData[0]?.properties?.find((p: any) => p.name === "SOLIDWORKS Custom Properties");
    let partNumber: string = customProps?.properties.find((p: any) => p.name.includes("bim2cam:Part Number"))?.value ?? "N/A";
    let shapeCode: string = customProps?.properties.find((p: any) => p.name.includes("IFC:Rebar:Shape Code"))?.value ?? "N/A";

    const boundingBox = await API.viewer.getObjectBoundingBoxes(modelID, [id]);
    let cogX: number = ((boundingBox[0].boundingBox.min.x + boundingBox[0].boundingBox.max.x)/2)*1000;
    let cogY: number = ((boundingBox[0].boundingBox.min.y + boundingBox[0].boundingBox.max.y)/2)*1000;
    let cogZ: number = ((boundingBox[0].boundingBox.min.z + boundingBox[0].boundingBox.max.z)/2)*1000;

    let startPosition: any = { positionX: cogX, positionY: cogY, positionZ: cogZ };
    let endPosition: any = { positionX: cogX, positionY: cogY+100, positionZ: cogZ };
  let color = { r: 0, g: 0, b: 255, a: 255 };
  if (partNumber.includes("STR")) {
  partNumber = partNumber.slice(-2); //remove last 3 characters
  if (omittedStringers.includes(id)) {
  partNumber += " - Omitted Stringer \n Do not place in fixture";
  color = { r: 255, g: 0, b: 0, a: 255 };
    }
  }
  else if ((partNumber.includes("REB") || partNumber.includes("RB2")) && shapeCode.includes("B")) {
     partNumber += "\n Remove Bridging Coupler(s)";
  }
    await API.markup.addTextMarkup([{ start: startPosition, end: endPosition, text: partNumber, color}]);
//changing the colours of the parts




  //Add dimension between datum and plate sub-assembly

    if ((partNumber.includes("REB") || partNumber.includes("RB2")) && (datumSide.includes("EAST") || datumSide.includes("WEST"))) {
//get bounding box of rebar, east uses max, west uses min
      let startX: number = datumSide === "EAST" ? boundingBox[0].boundingBox.max.x*1000 : boundingBox[0].boundingBox.min.x*1000;
      let endX: number = datumSide === "EAST" ? 14034 : -560.5; //fixed datum but based off origin position. Needs updating if origin changes
      let color = { r: 255, g: 0, b: 0, a: 255 };
       await API.markup.addMeasurementMarkups([
            {
                start: {
                    positionX: startX,
                    positionY: cogY,
                    positionZ: cogZ
                },
                end: {
                    positionX: endX,
                    positionY: cogY,
                    positionZ: cogZ
                },
                color
            }
       ]);
    }
  }
}


return (
  <>
    {loading ? (
      <p>Loading...</p>
    ) : station_type === "Vertical Weld Station" ? (
      <div className="root-wrapper">
        <div className="markNumberDiv">
          <h4 className="markNumberTitle" style={markNumberStyle}>
            {_modelName ?? 'Model name not found'}
            <br />
            {station_type ?? 'Station type not found'}
          </h4>
        </div>
        <div className="data-table-container">
          <DataTableComponentVWS Rebar={RebarList} onSelect={handleSelectVWS} />
        </div>
        <div className="buttonDiv" style={markNumberStyle}>
          <button onClick={handleClearAll}>Clear All</button>
        </div>
      </div>
    ) : station_type === "Horizontal Weld Station" ? (
      <div className="root-wrapper">
        <div className="markNumberDiv">
          <h4 className="markNumberTitle" style={markNumberStyle}>
            {_modelName ?? 'Model name not found'}
            <br />
            Horizontal Weld Station
            <br />
            {station_Config ?? 'Station config not found'}
          </h4>
        </div>
        <div className="buttonDiv" style={markNumberStyle}>
          <button onClick={handleSelectPlates}>Show profile plates</button>
        </div>
        <div className="data-table-container">
          <DataTableComponentHWS partRows={subAssemblyListHWS} onSelect={handleSelectHWS} />
        </div>
        <div className="buttonDiv" style={markNumberStyle}>
          <button onClick={handleClearAll}>Clear All</button>
        </div>
      </div>
    ) : station_type === "JIG Drawing Tool" ? (
      <JigPanel API={API} modelName={_modelName} />
    ) : (
      <p>Station type not supported</p>
    )}
  </>
);
}

export default App;
