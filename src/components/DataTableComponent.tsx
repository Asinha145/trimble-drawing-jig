import {datumItem} from './types';
import './DataTableComponent.css';

interface DataTableProps {
  Rebar: any[];
  onSelect: (id: number, _matchingDatum: datumItem) => void;
}


export const DataTableComponent: React.FC<DataTableProps> = ({ Rebar, onSelect}) => {
  const getPropValue = (item: any, propName: string): string => {
    const customProps = item.properties?.find((p: any) => p.name === "SOLIDWORKS Custom Properties");
    return (
      customProps?.properties.find((p: any) => p.name.includes(propName))?.value ?? "N/A"
    );
  };

  return (
    <div>
      {Rebar.length === 0 ? (
        <p>No rebar data available.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Fixture Position</th>
              <th>Sub-Assembly Reference</th>
              <th>Rebar Length</th>
              <th>Select</th>
            </tr>
          </thead>
          
<tbody>
  {[...Rebar] // clone to avoid mutating original
    .sort((a, b) => a.datumItem.label - b.datumItem.label)
    .map((item) => (
      <tr key={item.id}>
        <td>{item.datumItem.label}</td>
        <td>{getPropValue(item.RTWItem, "bim2cam:Part Number")}</td>
        <td>{getPropValue(item.rebarItem, "bim2cam:Rebar:Length")}</td> 
        <td>
          <button className="table-button" onClick={() => onSelect(item.RTWItem.id, item.datumItem)}>Select</button>
        </td>
      </tr>
    ))}
</tbody>

        </table>
      )}
    </div>
  );
};
