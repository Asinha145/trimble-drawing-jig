import { useState, useEffect } from 'react';
import { getJigObjects, buildView4VerticalBarDimensions, type JigData, type MeasurementMarkup } from '../module/TCJigData';
import { GetModelID } from '../module/TCFixtureTable';
import '../App.css';

interface JigPanelProps {
  API: any;
}

export function JigPanel({ API }: JigPanelProps) {
  const [modelID, setModelID] = useState<string>("");
  const [jigData, setJigData] = useState<JigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<number | null>(null);

  useEffect(() => {
    const initJig = async () => {
      try {
        const id = await GetModelID(API);
        setModelID(id);

        const data = await getJigObjects(id);
        setJigData(data);
      } catch (error) {
        console.error("Error initializing JIG panel:", error);
      } finally {
        setLoading(false);
      }
    };

    initJig();
  }, [API]);

  const handleViewClick = async (viewNumber: number) => {
    if (!modelID || !jigData) return;

    setActiveView(viewNumber);
    await API.markup.removeMarkups();

    try {
      if (viewNumber === 4) {
        // Build View 4 vertical bar measurements
        const measurements = await buildView4VerticalBarDimensions(modelID, jigData, jigData.datumX);

        if (measurements && measurements.length > 0) {
          await API.markup.addMeasurementMarkups(measurements);
        }
      }
      // Other views can be added here as needed
    } catch (error) {
      console.error(`Error rendering View ${viewNumber}:`, error);
    }
  };

  const handleClearAll = async () => {
    await API.markup.removeMarkups();
    setActiveView(null);
  };

  if (loading) {
    return <p>Loading JIG data...</p>;
  }

  if (!jigData) {
    return (
      <div className="root-wrapper">
        <div className="markNumberDiv">
          <h4 className="markNumberTitle" style={{ fontSize: '20px', color: 'black' }}>
            JIG Drawing Tool
          </h4>
        </div>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <p style={{ color: '#999', marginBottom: '20px' }}>
            This extension must be loaded through Trimble Connect with a JIG model.
          </p>
          <p style={{ color: '#666', fontSize: '12px' }}>
            Visit: <strong>https://connect.trimble.com</strong> and load a JIG project to use this tool.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="root-wrapper">
      <div className="markNumberDiv">
        <h4 className="markNumberTitle" style={{ fontSize: '20px', color: 'black' }}>
          JIG Drawing Tool
          <br />
          Datum: {jigData.datumValue}
        </h4>
      </div>

      <div className="buttonDiv" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', padding: '10px' }}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((viewNum) => (
          <button
            key={viewNum}
            onClick={() => handleViewClick(viewNum)}
            style={{
              padding: '12px',
              fontSize: '14px',
              backgroundColor: activeView === viewNum ? '#0e639c' : '#2d2d30',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '4px',
              fontWeight: activeView === viewNum ? 'bold' : 'normal'
            }}
          >
            View {viewNum}
          </button>
        ))}
      </div>

      <div className="buttonDiv" style={{ padding: '10px' }}>
        <button
          onClick={handleClearAll}
          style={{
            padding: '12px 20px',
            fontSize: '14px',
            backgroundColor: '#555',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            borderRadius: '4px'
          }}
        >
          Clear All
        </button>
      </div>

      <div style={{ padding: '10px', fontSize: '12px', color: '#999' }}>
        <p>Model ID: {modelID}</p>
        <p>Bounding Box: X [{jigData.boundingBox.min.x.toFixed(2)}, {jigData.boundingBox.max.x.toFixed(2)}]</p>
        <p style={{ color: activeView === 4 ? '#00ff00' : '#999' }}>View 4: Vertical bar measurements (red)</p>
      </div>
    </div>
  );
}
