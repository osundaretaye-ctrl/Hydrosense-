import React, { useEffect, useState, useRef } from "react";

/**
 * HydroSense — single-file React dashboard (replace src/App.jsx)
 *
 * Paste this entire file into src/App.jsx in your StackBlitz project.
 */

// --- Configuration (edit if you want different thresholds) ---
const THRESHOLDS = {
  pH: { min: 6.5, max: 8.5 },
  turbidity: { max: 5 }, // NTU
  temperature: { max: 35 }, // Celsius (informational)
  waterLevelPercent: { min: 20 } // percent low-level alert
};

// --- Helpers ---
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => Math.random() * (b - a) + a;
const format = (v, d = 2) => Number(v).toFixed(d);

// small smoothing function: move current toward target by fraction
function approach(current, target, rate = 0.18) {
  return current + (target - current) * rate;
}

// generate a small jitter around previous value for realistic drift
function jitter(prev, minDelta, maxDelta) {
  const d = rand(minDelta, maxDelta) * (Math.random() < 0.5 ? -1 : 1);
  return prev + d;
}

// --- Main component ---
export default function App() {
  const [modeScientific, setModeScientific] = useState(false);
  const [history, setHistory] = useState([]);
  const [current, setCurrent] = useState({
    timestamp: new Date().toISOString(),
    pH: 7.4,
    turbidity: 1.5,
    temperature: 28.0,
    waterLevelPercent: 78.5
  });

  const mounted = useRef(false);

  // simulation settings
  const INTERVAL_MS = 1800;
  const HISTORY_POINTS = 40;

  useEffect(() => {
    mounted.current = true;

    // seed history with smooth values
    let h = [];
    let prev = { ...current };
    for (let i = 0; i < HISTORY_POINTS; i++) {
      // slowly drift previous values
      prev = {
        timestamp: new Date(Date.now() - (HISTORY_POINTS - i) * INTERVAL_MS).toISOString(),
        pH: clamp(jitter(prev.pH ?? 7.4, 0.01, 0.08), 5.5, 9.5),
        turbidity: clamp(jitter(prev.turbidity ?? 1.5, 0.01, 0.4), 0, 12),
        temperature: clamp(jitter(prev.temperature ?? 28, 0.01, 0.2), 18, 42),
        waterLevelPercent: clamp((prev.waterLevelPercent ?? 78.5) - rand(0.02, 0.6), 0, 100)
      };
      // occasionally simulate past refill
      if (Math.random() < 0.03) prev.waterLevelPercent = clamp(rand(75, 100), 0, 100);
      h.push(prev);
    }
    setHistory(h);
    setCurrent(h[h.length - 1]);

    const interval = setInterval(() => {
      setHistory((prevHist) => {
        const last = prevHist[prevHist.length - 1] || current;

        // realistic next values:
        // pH: small random drift toward neutral 7.5 occasionally
        let nextPH = clamp(approach(last.pH, rand(6.8, 7.6), 0.08) + rand(-0.03, 0.03), 5.0, 9.5);

        // turbidity: small jitter, but occasionally a spike (contamination event)
        let nextTurb = clamp(last.turbidity + rand(-0.12, 0.28), 0, 20);
        if (Math.random() < 0.015) nextTurb = clamp(nextTurb + rand(2, 6), 0, 50);

        // temperature: very slow drift
        let nextTemp = clamp(approach(last.temperature, rand(26, 31), 0.03) + rand(-0.05, 0.12), 15, 45);

        // water level: small gradual change per tick (drop), occasional refill jump
        let nextLevel = last.waterLevelPercent - rand(0.05, 0.5); // slow decline
        // slightly random small increases possible (pump input, usage patterns)
        if (Math.random() < 0.06) nextLevel += rand(0.02, 0.3);
        // occasional refill event: jump to 78-100%
        if (Math.random() < 0.02) nextLevel = clamp(rand(78, 100), 0, 100);

        nextLevel = clamp(nextLevel, 0, 100);

        const nextPoint = {
          timestamp: new Date().toISOString(),
          pH: Number(nextPH.toFixed(2)),
          turbidity: Number(nextTurb.toFixed(2)),
          temperature: Number(nextTemp.toFixed(1)),
          waterLevelPercent: Number(nextLevel.toFixed(1))
        };

        const newHist = [...prevHist, nextPoint].slice(-HISTORY_POINTS);
        setCurrent(nextPoint);
        return newHist;
      });
    }, INTERVAL_MS);

    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // determine statuses
  const status = {
    pH: current.pH >= THRESHOLDS.pH.min && current.pH <= THRESHOLDS.pH.max ? "ok" : "bad",
    turbidity: current.turbidity <= THRESHOLDS.turbidity.max ? "ok" : "bad",
    temperature: current.temperature <= THRESHOLDS.temperature.max ? "ok" : "warn",
    waterLevel: current.waterLevelPercent >= THRESHOLDS.waterLevelPercent.min ? "ok" : "bad"
  };
  const overallOk = Object.values(status).every((s) => s === "ok" || s === "warn");

  // tiny sparkline path generator for one numeric array
  function sparkPath(values, w = 140, h = 36) {
    if (!values.length) return "";
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    return values
      .map((v, i) => {
        const x = (i / (values.length - 1 || 1)) * w;
        const y = h - ((v - min) / range) * h;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }

  // extract arrays for sparklines
  const pHSeries = history.map((d) => d.pH);
  const turbSeries = history.map((d) => d.turbidity);
  const tempSeries = history.map((d) => d.temperature);
  const levelSeries = history.map((d) => d.waterLevelPercent);

  // alert messages
  const alerts = [];
  if (status.pH === "bad") alerts.push(`pH ${format(current.pH)} out of safe range (${THRESHOLDS.pH.min}-${THRESHOLDS.pH.max})`);
  if (status.turbidity === "bad") alerts.push(`Turbidity ${format(current.turbidity)} NTU > ${THRESHOLDS.turbidity.max}`);
  if (status.waterLevel === "bad") alerts.push(`Water level ${current.waterLevelPercent}% low (< ${THRESHOLDS.waterLevelPercent.min}%)`);

  return (
    <div style={{ fontFamily: "Inter, system-ui, Roboto, Arial", color: "#e6eef6", minHeight: "100vh", background: "linear-gradient(180deg,#041225,#071a2a)" }}>
      {/* Inline CSS for the component (paste-only simplicity) */}
      <style>{`
        .container{max-width:1100px;margin:14px auto;padding:16px}
        .header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
        .brand{display:flex;flex-direction:column}
        .brand h1{margin:0;font-size:20px;color:#dff6fb}
        .brand p{margin:2px 0 0;color:#9fb7c1;font-size:13px}
        .controls{display:flex;gap:8px;align-items:center}
        .btn{background:transparent;border:1px solid rgba(255,255,255,0.06);padding:8px 12px;border-radius:8px;color:#cfe9ef;cursor:pointer}
        .btn.primary{background:linear-gradient(90deg,#06b6d4,#0891b2);border:none;color:#021519}
        .top-grid{display:grid;grid-template-columns:1fr 320px;gap:14px}
        .cards{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
        .card{background:rgba(255,255,255,0.03);padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.03)}
        .card h3{margin:0;color:#9fb7c1;font-size:13px}
        .metric{font-size:20px;font-weight:700;margin-top:8px}
        .muted{color:#9fb7c1;font-size:12px;margin-top:8px}
        .status-box{padding:12px;border-radius:10px}
        .status-ok{background:linear-gradient(90deg,rgba(16,185,129,0.06), rgba(6,182,212,0.02));border:1px solid rgba(16,185,129,0.08);color:#9ef0d9}
        .status-bad{background:linear-gradient(90deg,rgba(239,68,68,0.06), rgba(6,182,212,0.02));border:1px solid rgba(239,68,68,0.08);color:#ffd6d6}
        .gauge-row{display:flex;gap:10px;align-items:center;margin-top:10px}
        .tank-wrap{width:88px}
        .tank{width:88px;height:180px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);background:linear-gradient(180deg,rgba(255,255,255,0.01),rgba(255,255,255,0.02));overflow:hidden;position:relative}
        .fill{position:absolute;left:0;right:0;bottom:0;transition:height 1s linear}
        .gauge-small{background:rgba(255,255,255,0.02);padding:8px;border-radius:8px;text-align:center}
        .alerts{margin-top:12px}
        .alert-item{background:rgba(255,255,255,0.02);padding:8px;border-radius:6px;margin-top:6px;border-left:4px solid #f97316}
        .charts-row{margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        .spark{width:100%;height:36px}
        @media (max-width:760px){
          .top-grid{grid-template-columns:1fr}
          .charts-row{grid-template-columns:1fr}
          .cards{grid-template-columns:1fr 1fr}
        }
      `}</style>

      <div className="container">
        <div className="header">
          <div className="brand">
            <h1>HydroSense</h1>
            <p>IoT-Based Water Quality Monitoring — University of Ibadan (Prototype)</p>
          </div>

          <div className="controls">
            <button className="btn" onClick={() => setModeScientific(!modeScientific)}>
              {modeScientific ? "Standard View" : "Scientific View"}
            </button>
            <button
              className="btn primary"
              onClick={() => {
                // quick demo: force a refill event for presentation
                setHistory((prev) => {
                  const forced = prev.slice();
                  const last = forced[forced.length - 1];
                  const refill = { ...last, waterLevelPercent: clamp(rand(82, 100), 0, 100), timestamp: new Date().toISOString() };
                  forced.push(refill);
                  return forced.slice(-HISTORY_POINTS);
                });
              }}
              title="Force refill (demo)"
            >
              Force Refill
            </button>
          </div>
        </div>

        <div className="top-grid">
          <div>
            <div className="cards">
              <div className="card">
                <h3>pH</h3>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                  <div>
                    <div className="metric" style={{ color: status.pH === "ok" ? "#9ef0d9" : "#ffd6d6" }}>{format(current.pH, 2)}</div>
                    <div className="muted">Acidity / Alkalinity</div>
                  </div>
                  <div style={{ width: 140 }}>
                    <svg className="spark" viewBox="0 0 140 36" preserveAspectRatio="none">
                      <path d={sparkPath(pHSeries, 140, 36)} stroke={status.pH === "ok" ? "#31c5b6" : "#ff758c"} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                    </svg>
                    <div style={{ fontSize: 11, color: "#8fb6bd", textAlign: "right" }}>{new Date(current.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
                {modeScientific && <div className="muted">Sensor: pH-01 • Range used: {THRESHOLDS.pH.min}-{THRESHOLDS.pH.max}</div>}
              </div>

              <div className="card">
                <h3>Turbidity (NTU)</h3>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                  <div>
                    <div className="metric" style={{ color: status.turbidity === "ok" ? "#9ef0d9" : "#ffd6d6" }}>{format(current.turbidity, 2)}</div>
                    <div className="muted">Suspended particles (NTU)</div>
                  </div>
                  <div style={{ width: 140 }}>
                    <svg className="spark" viewBox="0 0 140 36" preserveAspectRatio="none">
                      <path d={sparkPath(turbSeries, 140, 36)} stroke={status.turbidity === "ok" ? "#f59e0b" : "#ff6b6b"} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                    </svg>
                    <div style={{ fontSize: 11, color: "#8fb6bd", textAlign: "right" }}>safe ≤ {THRESHOLDS.turbidity.max} NTU</div>
                  </div>
                </div>
                {modeScientific && <div className="muted">Sensor: Turb-01 • Probe model demo</div>}
              </div>

              <div className="card">
                <h3>Temperature (°C)</h3>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                  <div>
                    <div className="metric" style={{ color: "#ffdca8" }}>{format(current.temperature, 1)}</div>
                    <div className="muted">Water temperature</div>
                  </div>
                  <div style={{ width: 140 }}>
                    <svg className="spark" viewBox="0 0 140 36" preserveAspectRatio="none">
                      <path d={sparkPath(tempSeries, 140, 36)} stroke="#fb923c" fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                    </svg>
                    <div style={{ fontSize: 11, color: "#8fb6bd", textAlign: "right" }}>{THRESHOLDS.temperature.max}°C threshold</div>
                  </div>
                </div>
                {modeScientific && <div className="muted">Sensor: DS18B20 (simulated)</div>}
              </div>

              <div className="card">
                <h3>Water Level</h3>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div className="metric" style={{ color: status.waterLevel === "ok" ? "#9ef0d9" : "#ffd6d6" }}>{format(current.waterLevelPercent, 1)}%</div>
                    <div className="muted">Tank fill (%)</div>
                  </div>
                  <div className="tank-wrap">
                    <div className="tank" role="img" aria-label="water tank">
                      <div
                        className="fill"
                        style={{
                          height: `${clamp(current.waterLevelPercent, 0, 100)}%`,
                          background: current.waterLevelPercent > 60 ? "linear-gradient(180deg,#06b6d4,#0ea5a4)" : current.waterLevelPercent > 30 ? "linear-gradient(180deg,#f59e0b,#f97316)" : "linear-gradient(180deg,#ef4444,#f43f5e)"
                        }}
                      />
                    </div>
                  </div>
                </div>
                {modeScientific && <div className="muted">Ultrasonic sensor: HC-SR04 (simulated) • Resolution ~0.1%</div>}
              </div>
            </div>

            <div className="charts-row">
              <div className="card">
                <h3>pH Trend</h3>
                <svg className="spark" viewBox="0 0 300 80" preserveAspectRatio="none">
                  <path d={sparkPath(pHSeries, 300, 80)} stroke={status.pH === "ok" ? "#31c5b6" : "#ff758c"} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              </div>
              <div className="card">
                <h3>Turbidity Trend</h3>
                <svg className="spark" viewBox="0 0 300 80" preserveAspectRatio="none">
                  <path d={sparkPath(turbSeries, 300, 80)} stroke={status.turbidity === "ok" ? "#f59e0b" : "#ff6b6b"} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              </div>
              <div className="card">
                <h3>Temp Trend</h3>
                <svg className="spark" viewBox="0 0 300 80" preserveAspectRatio="none">
                  <path d={sparkPath(tempSeries, 300, 80)} stroke="#fb923c" fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className={`status-box ${overallOk ? "status-ok" : "status-bad"}`}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, color: "#9fb7c1" }}>Overall Status</div>
                    <div style={{ fontWeight: 800, fontSize: 18, marginTop: 6 }}>{overallOk ? "SAFE" : "ATTENTION"}</div>
                    <div style={{ color: "#9fb7c1", fontSize: 12, marginTop: 6 }}>{new Date(current.timestamp).toLocaleString()}</div>
                  </div>
                </div>

                <div className="alerts">
                  {alerts.length ? (
                    alerts.map((a, i) => (
                      <div className="alert-item" key={i}>
                        {a}
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "#9fb7c1", paddingTop: 8 }}>All sensors within safe thresholds.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right column: contextual info */}
          <div>
            <div className="card">
              <h3>Latest Reading</h3>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 13, color: "#9fb7c1" }}>Timestamp</div>
                <div style={{ fontWeight: 700, marginTop: 6 }}>{new Date(current.timestamp).toLocaleString()}</div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, color: "#9fb7c1" }}>Location</div>
                  <div style={{ fontWeight: 700, marginTop: 6 }}>UI Hostel Tank A (demo)</div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, color: "#9fb7c1" }}>Notes</div>
                  <div style={{ marginTop: 6, color: "#cfe9ef", fontSize: 13 }}>
                    This page shows simulated sensor data. Replace the simulator with your ESP32 HTTP/WebSocket feed for real live readings.
                  </div>
                </div>

                {modeScientific && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, color: "#9fb7c1" }}>Sensor Details</div>
                    <ul style={{ marginTop: 8, color: "#cfe9ef" }}>
                      <li>pH: Analog / pH probe</li>
                      <li>Turbidity: Optical turbidity sensor</li>
                      <li>Temperature: DS18B20</li>
                      <li>Water level: Ultrasonic (HC-SR04) or float sensor</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <h3>Controls & Demo</h3>
              <div style={{ marginTop: 8, color: "#9fb7c1", fontSize: 13 }}>Use the button above to toggle scientific mode or force a refill event for presentation.</div>
              {modeScientific && <div style={{ marginTop: 10, color: "#cfe9ef", fontSize: 13 }}>You can copy these values for lab comparison or export.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}