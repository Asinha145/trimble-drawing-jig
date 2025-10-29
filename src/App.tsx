
import { useState, useEffect } from 'react';
import './App.css';
import { WorkspaceAPI } from 'trimble-connect-workspace-api';

// Components
import DataTableComponent from './components/DataTableComponent';
import { ConnectViewer, API } from './module/TCEntryPoint';

function App() {
  const [count, setCount] = useState(0);
  const [BBSRebarItems, setBBSRebarItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ConnectViewer();

    // Simulate async loading
    setTimeout(async () => {
      try {
        await API.extension.requestFocus();
        // TODO: Fetch and set BBSRebarItems here
        // Example: const data = await API.getBBSData();
        // setBBSRebarItems(data);
      } catch (error) {
        console.error("Error during API focus or data fetch:", error);
      } finally {
        setLoading(false); // Set loading to false after async work
      }
    }, 3000);
  }, []);

  const markNumberStyle = { color: 'blue' };
  const ASSEMBLY_DATA = { CEMC_MARKNUM: '12345' };
  const Latest_Rev_Code = 'A2'; 
  
  return (
    <>
      {
        <div>
          <div className="markNumberDiv">
            <h4 className="markNumberTitle" style={markNumberStyle}>
              {ASSEMBLY_DATA.CEMC_MARKNUM + '-' + Latest_Rev_Code}
            </h4>
          </div>
          <div className="data-table-container">
            <DataTableComponent _BBSRebarItems={BBSRebarItems} />
          </div>
        </div>
      }
    </>
  );
}

export default App;
