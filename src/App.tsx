
import { useState, useEffect } from 'react';
import './App.css';
import { DataTableComponent } from './components/DataTableComponent';
import { ConnectViewer, API } from './module/TCEntryPoint';
import { GetModelID, modelName, GetRebars } from './module/TCFixtureTable';
import type { ObjectSelector, IModelEntities, HierarchyType, HierarchyEntity } from 'trimble-connect-workspace-api';
import {datumItem} from './components/types';
import { start } from 'repl';

function App() {
  const [RebarList, setRebarList] = useState<any[]>([]);
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
      }
      const getRebars = await GetRebars(API);
      setRebarList(getRebars);

      setLoading(false);
    }, 3000);
  }, []);

  const markNumberStyle = { fontSize: '30px', color: 'black' };

  // ✅ Selection + Annotation
  const handleSelect = async (objectId: number, _matchingDatum: datumItem) => {
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
let stringerStarts: any[] = [];
let yComponent: number = 0;

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
        stringerStarts.push({positionX: boundingBox[0].boundingBox.min.x, positionY: boundingBox[0].boundingBox.min.y, positionZ: boundingBox[0].boundingBox.min.z});
    }
    yComponent = cogY;
        let colour = { r: 255, g: 0, b: 0, a: 255 }
    if (partNumber.includes("RTW")) {
      cogX = boundingBox[0].boundingBox.max.x*1000;
      colour = { r: 50, g: 50, b: 50, a: 255 }
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

  const smallestX = Math.min(...stringerStarts.map(obj => obj.positionX))*1000;

if (_matchingDatum) {
  await API.markup.addMeasurementMarkups([
    {
      start: {
        positionX: _matchingDatum.positionX,
        positionY: _matchingDatum.positionY,
        positionZ: _matchingDatum.positionZ,
      },
      end: {
        positionX: smallestX,
        positionY: _matchingDatum.positionY,
        positionZ: 16
      },
      color: { r: 255, g: 0, b: 0, a: 255 }
    }
  ]);
} else {
  console.log("No datum found within tolerance.");
}


};

  // ✅ Clear All button handler
  const handleClearAll = () => {
    API.viewer.setSelection({ modelObjectIds: [] }, "set");
    API.viewer.reset();
    
  };

  return (
    <>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div>
          <div className="markNumberDiv">
            <h4 className="markNumberTitle" style={markNumberStyle}>
              {_modelName ?? 'Model name not found'}
              <br />
              {station_type ?? 'Station type not found'}
            </h4>
          </div>
          <div className="data-table-container">
            <DataTableComponent Rebar={RebarList} onSelect={handleSelect}/>
          </div>
          <div style={{ marginTop: "10px" }}>
            <button onClick={handleClearAll}>Clear All</button>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
