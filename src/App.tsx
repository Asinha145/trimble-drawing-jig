
import { useState, useEffect } from 'react';
import './App.css';
import { DataTableComponentVWS, DataTableComponentHWS } from './components/DataTableComponent';
import { ConnectViewer, API } from './module/TCEntryPoint';
import { GetModelID, modelName, GetRebarsVWS, getPlatesHWS } from './module/TCFixtureTable';
import type { ObjectSelector, IModelEntities, HierarchyType, HierarchyEntity } from 'trimble-connect-workspace-api';
import {datumItem, boundingBox} from './components/types';
import { start } from 'repl';

function App() {
  const [RebarList, setSubAssemblyList] = useState<any[]>([]);
  const [PlateList, setPlateList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modelID, setModelID] = useState<string>("");
  const [datumList, setDatumList] = useState<{ positionX: number; positionY: number; positionZ: number; label: string }[]>([]);
  const [_modelName, setModelName] = useState<string>("");
  const [station_type, setStation_type] = useState<string>("");
  useEffect(() => {
    ConnectViewer();

    setTimeout(async function () {
      //await API.extension.requestFocus();
      const id = await GetModelID(API);
      setModelID(id);

      if (modelName.includes("VWS")) {
        await API.extension.requestFocus();
        setModelName(modelName.slice(0, 5));
        setStation_type("Vertical Weld Station");
        const getRebars = await GetRebarsVWS(API);
        setSubAssemblyList(getRebars);
      }
      else if (modelName.includes("HWS")) {
        await API.extension.requestFocus();
        setModelName(modelName.slice(0, 5));
        setStation_type("Horizontal Weld Station");
        const getPlates = await getPlatesHWS(API);
        setPlateList(getPlates);
      }
      setLoading(false);
    }, 3000);
  }, []);

  const markNumberStyle = { fontSize: '20px', color: 'black' };

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

    //API.viewer.isolateEntities(entitiesToIsolate);

//API.viewer.setSelection(selector, "remove");
console.log("Selected Object ID:", objectId);

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
    if (partNumber.includes("RTW")) {
      cogX = boundingBox[0].boundingBox.max.x*1000;
      colour = { r: 50, g: 50, b: 50, a: 255 }
    }
    else if (partNumber.includes("REB")) {
 cogX = boundingBox[0].boundingBox.min.x*1000;
    }


let BBXMin: number = boundingBox[0].boundingBox.min.x ?? 0;
let BBYMin: number = boundingBox[0].boundingBox.min.y ?? 0;
let BBZMin: number = boundingBox[0].boundingBox.min.z ?? 0;
let BBXMax: number = boundingBox[0].boundingBox.max.x ?? 0;
let BBYMax: number = boundingBox[0].boundingBox.max.y ?? 0;
let BBZMax: number = boundingBox[0].boundingBox.max.z ?? 0;
console.log("BBXMin:", BBXMin, "BBYMin:", BBYMin, "BBZMin:", BBZMin);
console.log("BBXMax:", BBXMax, "BBYMax:", BBYMax, "BBZMax:", BBZMax);
console.log("Bounding Box for Object ID", child.id, ":", boundingBox[0].boundingBox.min.x);



    let startPosition: any = { positionX: cogX, positionY: cogY, positionZ: cogZ };
    let endPosition: any = { positionX: cogX, positionY: cogY+100, positionZ: cogZ };
    console.log("Start Position:", startPosition, "End Position:", endPosition);
    
  if (partNumber.includes("RTW")) {
  await API.markup.addTextMarkup([{ start: startPosition, end: endPosition, text: partNumber + "\n" + " Fixture position: " + _matchingDatum.label, color:  colour}]);
  }
  else{
await API.markup.addTextMarkup([{ start: startPosition, end: endPosition, text: partNumber, color:  colour}]);
  }
  }

  let smallestX: any;
// First: sort by min X
stringerboundingBox.sort((a, b) => a.xMin - b.xMin);
console.log("Sorted Stringer Bounding Boxes:", stringerboundingBox);
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
let yOffset = filtered.length > 1 ? -5 : 0;

if (_matchingDatum) {

    for (const box of filtered) {

        const smallestX = box.xMin;

        const color = colours[colorIndex % colours.length]; 
        colorIndex++;  // move to next colour

        await API.markup.addMeasurementMarkups([
            {
                start: {
                    positionX: _matchingDatum.positionX,
                    positionY: _matchingDatum.positionY + yOffset,
                    positionZ: _matchingDatum.positionZ,
                },
                end: {
                    positionX: smallestX,
                    positionY: _matchingDatum.positionY + yOffset,
                    positionZ: 16
                },
                color
            }
        ]);

        yOffset += 10;

        console.log(`Dimension added at X=${smallestX} with colour:`, color);
    }

} else {
    console.log("No datum found within tolerance.");
}


};

  // ✅ Clear All button handler
  const handleClearAll = () => {
    API.viewer.setSelection({ modelObjectIds: [] }, "set");
    API.viewer.reset();
    
  };

    // ✅ Clear All button handler
  const handleSelectPlates = async () => {
    await API.markup.removeMarkups();
    for (const plate of PlateList) {
    await API.markup.addTextMarkup([{ start: plate.dimensionStart, end: plate.dimensionEnd, text: plate.Name, color:  { r: 255, g: 0,   b: 0,   a: 255 }}]);
    }
    
  };

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
          </h4>
        </div>
        <div className="buttonDiv" style={markNumberStyle}>
          <button onClick={handleSelectPlates}>Show required plates</button>
        </div>
        <div className="data-table-container">
        <p>Horizontal data here </p>
        </div>
      </div>
    ) : (
      <p>Station type not supported</p>
    )}
  </>
);
}

export default App;
