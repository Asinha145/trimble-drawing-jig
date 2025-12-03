import {datumItem} from './types';
import './DataTableComponent.css';
import { GetIFCProperty } from "../module/ArrayObjectUtility";

interface DataTablePropsVWS {
  Rebar: any[];
  onSelect: (id: number, _matchingDatum: datumItem) => void;
}

export const DataTableComponentVWS: React.FC<DataTablePropsVWS> = ({ Rebar, onSelect}) => {
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
              <th>Fixture<br />Position</th>
              <th>Sub-Assembly<br />Reference</th>
            </tr>
          </thead>
<tbody>
  {[...Rebar] // clone to avoid mutating original
    .sort((a, b) => a.datumItem.label - b.datumItem.label)
    .map((item) => (
      <tr key={item.id}>
        <td>{getPropValue(item.RTWItem, "bim2cam:Part Number").replace('RTW-', '')}</td>
        <td>
          <button className="table-button" onClick={() => onSelect(item.RTWItem.id, item.datumItem)}>{item.datumItem.label}</button>
        </td>
      </tr>
    ))}
</tbody>

        </table>
      )}
    </div>
  );
};

import React from "react";

// --- Types ---
type RGBA = { r: number; g: number; b: number; a: number };

interface PartRow {
  col1: string;
  col2: number | string; // allow header-like text
  col3: string;
  id: number[];
  colour?: RGBA;         // optional: present only on unique part rows with matched colour
}

interface DataTablePropsHWS {
  partRows: PartRow[];
  onSelect?: (id: number[]) => void; // optional click handler
}

// --- Component ---
export const DataTableComponentHWS: React.FC<DataTablePropsHWS> = ({ partRows, onSelect }) => {
  const headerCellStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "6px",
    fontWeight: 600,
    borderBottom: "2px solid #333",
    backgroundColor: "#afafaf9a",
  };

  const subheaderCellStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "6px",
    fontWeight: 600,
    borderBottom: "2px solid #333",
    backgroundColor: "#f5f5f5",
  };

  const bodyCellStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "6px",
    borderBottom: "1px solid #ccc",
  };

  // Identify exact header-like rows in the body
  const isSectionHeaderExact = (row: PartRow) => {
    const left = String(row.col1).trim();
    const right = String(row.col2).trim().toUpperCase();
    return left === "Sub-Assembly Reference" && right === "FIXTURE POSITION";
  };

  const isSubHeaderExact = (row: PartRow) => {
    const left = String(row.col1).trim();
    const right = String(row.col2).trim().toUpperCase();
    return left === "Part Number" && right === "QUANTITY";
  };

  // Only show button when col2 is a number (actual quantity)
  const isQuantityRow = (
    row: PartRow
  ): row is { col1: string; col2: number; col3: string; id: number[]; colour?: RGBA } =>
    typeof row.col2 === "number" && Number.isFinite(row.col2);

  // --- Helpers: RGBA -> CSS rgba() and readable text colour ---
  const toCssRgba = (c?: RGBA) => {
    if (!c) return undefined;
    const a01 = Math.max(0, Math.min(1, c.a / 255)); // normalize alpha to 0..1 for CSS
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${a01})`;
  };

  const pickTextColor = (rgbaCss?: string) => {
    if (!rgbaCss) return undefined;
    const m = rgbaCss.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return undefined;
    const r = +m[1], g = +m[2], b = +m[3];
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.6 ? "#000" : "#fff";
  };

  return (
    <div>
      {!partRows || partRows.length === 0 ? (
        <p>No parts available.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={headerCellStyle}>Sub-Assembly Reference</th>
              <th style={headerCellStyle}>Fixture Position</th>
            </tr>
          </thead>

          <tbody>
            {partRows.map((row, idx) => {
              // Render section headers inside tbody as <th> to match your header formatting
              if (isSectionHeaderExact(row)) {
                return (
                  <tr key={`section-${idx}`}>
                    <th style={headerCellStyle} scope="col">
                      {row.col1}
                    </th>
                    <th style={headerCellStyle} scope="col">
                      {row.col2}
                    </th>
                  </tr>
                );
              } else if (isSubHeaderExact(row)) {
                return (
                  <tr key={`section-${idx}`}>
                    <th style={subheaderCellStyle} scope="col">
                      {row.col1}
                    </th>
                    <th style={subheaderCellStyle} scope="col">
                      {row.col2}
                    </th>
                  </tr>
                );
              }

              // Regular data row
              const bg = toCssRgba(row.colour); // present on unique part rows only
              const fg = pickTextColor(bg) ?? undefined;

              return (
                <tr key={`${row.col1}-${row.col2}-${idx}`}>
                  <td style={bodyCellStyle}>{row.col1}</td>

                  <td style={bodyCellStyle}>
                    {isQuantityRow(row) ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          className="table-button"
                          // Only override colours when a row colour exists; otherwise keep default CSS
                          style={
                            bg
                              ? {
                                  backgroundColor: bg,
                                  color: fg,
                                  border: "none", 
                                }
                              : undefined
                          }
                          onClick={() => {
                            if (onSelect) onSelect(row.id);
                          }}
                        >
                          {/* e.g., "3  @16 mm" or "3  @16mm" depending on col3 */}
                          {String(row.col2)}
                          {row.col3 ? `@${row.col3}` : ""}
                        </button>
                      </div>
                    ) : (
                      // For non-numeric col2 (e.g., headers), just render the text
                      <span>{row.col2}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}