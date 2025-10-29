import './FixtureDataTable.css';

//Import modules
import * as WorkspaceAPI from "trimble-connect-workspace-api";
import { GetModelID } from '../module/TCFixtureTable';
import DataTable from 'react-data-table-component';
import { useState } from 'react';
import { UIStore, useUIStore } from '../azustand/store'

const customTableStyles = {
  headCells: {
    style: {
      backgroundColor: '#d3d3d3'
    },
  },

  rows: {
    style: {
      backgroundColor: '#d3d3d3',

    },
  },

};

const customTableStyles_Main = {
  expanderButton: {
    style: {
      backgroundColor: '#d3d3d3',

    },
  },
}

const columns = [
  {
    name: 'Mark',
    selector: (row: any) => row.Mark,
    width: "77px",
  },
  {
    name: 'Qty',
    selector: (row: any) => row.Qty,
    width: "60px",

  },
  {
    name: 'Size',
    selector: (row: any) => row.Size,
    width: "60px",
  },
  {
    name: 'L (mm)',
    selector: (row: any) => row.Length,
    width: "85px",
  },
  {
    name: 'Shape',
    selector: (row: any) => row.Shape,
    width: "70px",
  },
];

const Get_Columns_Expanded = (rowType: any, HiddenType: any) => {
  let columns_expanded: any = [];

 //For Looses and Cages displays below data column names
    columns_expanded = [
      {
        name: 'Dim A',
        selector: (row: any) => row.DimA,
        width: "70px",
      },
      {
        name: 'Dim B',
        selector: (row: any) => row.DimB,
        width: "70px",
      },
      {
        name: 'Dim C',
        selector: (row: any) => row.DimC,
        width: "70px",
      },
      {
        name: 'Dim D',
        selector: (row: any) => row.DimD,
        width: "70px",
      },
      {
        name: 'Dim E',
        selector: (row: any) => row.DimE,
        width: "70px",
      },
      {
        name: 'Type',
        selector: (row: any) => row.Type,
        width: "80px",
      },

    ]

  return columns_expanded

}



//For passing into main BBS Table expandable props
const ExpandedBBSData = (data: any) => {
  let expanded_DataArray = [{
    DimA: data.data.DimA, DimB: data.data.DimB, DimC: data.data.DimC,
    DimD: data.data.DimD, DimE: data.data.DimE, LongData: data.data.LongData, CrossData: data.data.CrossData, Type: data.data.Type, HiddenType: data.data.HiddenType
  }]
  return (
    <div>
      {/*<pre>{JSON.stringify(data, null, 2)}</pre>*/}
      {/*<h5>{"DimA: " + JSON.stringify(data.data.DimA)}</h5>*/}
      <BBSDataTable_Expanded _data={expanded_DataArray} />
    </div>

  )
}

//Component to render the expanded sub table
function BBSDataTable_Expanded(_data: any) {
  let expanded_Data = _data._data
  let rowType = _data._data[0].Type //Using to conditionally render different data for meshes
  let HiddenType = _data._data[0].HiddenType //used to trigger long and cross data for rebar assemblies   
  let columns_expanded = Get_Columns_Expanded(rowType, HiddenType)

  return (
    <div className='dataTableDiv_Expanded'>
      <DataTable
        responsive={true}
        columns={columns_expanded}
        data={expanded_Data}
        dense={true}
        customStyles={customTableStyles} />

    </div>
  )

}

function BBSDataTable({ BBSRebardata, _API }: any) {
  //Zustand state to decide whether to load legacy UI or not
  const { pluginVersion}: UIStore = useUIStore()

  const [isDimming, setDimming] = useState<boolean>(false);

  return (

    <>
      <div className='dataTableDiv'><DataTable
        disabled={isDimming}
        responsive
        columns={columns}
        data={BBSRebardata}
        highlightOnHover={true}
        dense={true}
        selectableRowsHighlight={true}
        selectableRows={true}
        expandableRows={true}
        expandableRowsComponent={ExpandedBBSData}
        customStyles={customTableStyles_Main}

        // onSelectedRowsChange={async (selected: any) => {

        //   const API: WorkspaceAPI.WorkspaceAPI = _API;
        //   await _API.markup.removeMarkups(undefined); //Clearing if multi table selected to avoid duplicate dims
        //   const modelID = await GetModelID(API);

        //   let tickedRows = selected.selectedRows;


        //   //Objectselector modelObject properties strictly accepts object in format [{modelId: XXXX, objectRuntimeIds: [xx, xx]}]
        //   let objects_toSelect_IDList: any = [];
        //   let objects_toSelect_Format: any = [{ modelId: modelID, objectRuntimeIds: objects_toSelect_IDList }]

        //   let modelObjSelector: WorkspaceAPI.ObjectSelector = {};
        //   modelObjSelector.modelObjectIds = objects_toSelect_Format;

        //   //Getting the ids from ticked rows and adding into the object selector property format array
        //   for (let dataRow of tickedRows) {
        //     let selected_Ids_fromRow = dataRow.Id;
        //     objects_toSelect_IDList.push(...selected_Ids_fromRow)
        //   }

        //   setDimming(true) //disabling table temporarily to prevent spam selections

        //   //finally selecting the fixtures actively ticked in the data table
        //   await API.viewer.setSelection(modelObjSelector, "set");
        //   if (pluginVersion !== 0) { //to still show call offs through table if dimming off
        //     await SelectNotesDetails(objects_toSelect_IDList, API, false)

        //     //#region table call offs for loose meshes/rebar cage assemblies. Seperate to call off from selection event
        //     let latestTickedRow = tickedRows[0] //latest selected appears on top/ at index 0 array
        //     let hiddenType: string = latestTickedRow?.HiddenType || "UNDEFINED"
        //     let objectType: string = latestTickedRow?.Type

        //     if (hiddenType === "LOOSEMESH" || objectType === "MESH") {
        //       let firstBarID: number = latestTickedRow.Id[0]
        //       let looseMesh_Name: string = latestTickedRow.Mark
        //       await DisplayMeshMarksForSelectedMeshes(API)
        //       await DisplayMeshMark([firstBarID], API, looseMesh_Name) //creating call off on just the bar of the loosemesh/rebar cage assembly
        //     }

        //     //#endregion
        //   }
        //   if (pluginVersion !== 0 && dimSelectionChecked === true) {
        //     await DimensionObject(API, modelID, objects_toSelect_IDList) //Dimming from selection event instead
        //     await SelectNotesDetails(objects_toSelect_IDList, API, true)
        //   }


        //   setDimming(false)

        // }}
      />
        <div className={isDimming ? 'overlay' : 'hidden'}> <h4>Dimming or Clearing View Please Wait...</h4></div>
      </div>
    </>
  )
}

 export default BBSDataTable