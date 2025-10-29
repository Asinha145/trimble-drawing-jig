//Component for rendering CEMC Assembly/Cast Unit Data i.e cover, lifting details, unit ID


import { useEffect, useState } from 'react';
import './DataTableComponent.css';

//Importing onClick modules from CameraView.ts module

//UI Library Components from Ant Design
import { CollapseProps, Collapse, Button, Flex } from 'antd';

//Importing fixture table, BBS table, carousel, global API, castItemsData as props for display
import { API } from '../module/TCEntryPoint';
import BBSDataTable from './BBSDataTable';
import { UIStore, useUIStore } from '../azustand/store'



  
//Private modules
let preconfigured_View_Buttons_Visible: boolean = true;

export const Hide_Preconfigured_View_Button = () => { //used to hide preconfigured view buttons if conc points empty used in TCFixtureTable
  preconfigured_View_Buttons_Visible = false;
}

  //Public Component

function DataTableComponent({_BBSRebarItems}: any){

  //Zustand state to decide whether to load legacy UI or not
  const { pluginVersion }: UIStore = useUIStore()  

    const [assemblyData, setAssemblyData] = useState<any>([])
    const [revisisonState, setRevisisonState]= useState<any>([])
    const [notesDataState, setNotesDataState] = useState<any>([])

    const items: CollapseProps['items'] = [
        {
          key: '1',
          label: 'Bar Bending Schedule',
          children: <BBSDataTable BBSRebardata={_BBSRebarItems} _API={API} />,
        }
      ]
            return (   
        <>
        <Collapse size='small' items={items} />
        </>
    )
}

export default DataTableComponent