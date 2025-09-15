import { useEffect, useState } from "react";
import ScaleSelector from "./ScaleSelector";
import { DevicesStatus } from "../../types/devices";

const ScaleFetcher = () => {
  const [status, setStatus] = useState<DevicesStatus>("disconnected");
  const [availableScales, setAvailableScales] = useState<string[]>([]);
  const [selectedScale, setSelectedScale] = useState<string | null>(null);
  const [scaleWeightData, setScaleWeightData] = useState("");
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [baudRateTestResults, setBaudRateTestResults] = useState<any[]>([]);
  const [isTestingBaudRates, setIsTestingBaudRates] = useState(false);
  const [commandInput, setCommandInput] = useState("");

  // List ports on mount
  useEffect(() => {
    const fetchScales = async () => {
      setStatus("loading");
      try {
        const api = (window as any).serial;
        if (api?.list) {
          const res = await api.list();
          if (res?.ok && Array.isArray(res.ports)) {
            const ports: string[] = res.ports.map((p: any) => p?.path ?? String(p));
            setAvailableScales(ports);
            setStatus("disconnected");
            return;
          }
        }
        // Fallback demo data if preload is not available
        await new Promise((r) => setTimeout(r, 300));
        setAvailableScales(["Scale A", "Scale B", "Scale C"]);
        setStatus("disconnected");
      } catch (e) {
        console.error(e);
        setStatus("error");
      }
    };
    fetchScales();
  }, []);

  // Subscribe to data/error/closed for the selected port
  useEffect(() => {
    if (!selectedScale) return;
    const api = (window as any).serial;
    
    const addDebugLog = (message: string) => {
      setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${message}`]);
    };
    
    const offData = typeof api?.onData === "function" ? api.onData((payload: any) => {
      if (payload?.path === selectedScale) {
        addDebugLog(`Weight data received: ${payload.data} kg`);
        setScaleWeightData(String(payload.data ?? ""));
      }
    }) : undefined;
    
    const offError = typeof api?.onError === "function" ? api.onError((payload: any) => {
      if (payload?.path === selectedScale) {
        addDebugLog(`Error: ${payload.error}`);
        setStatus("error");
      }
    }) : undefined;
    
    const offClosed = typeof api?.onClosed === "function" ? api.onClosed((payload: any) => {
      if (payload?.path === selectedScale) {
        addDebugLog("Port closed");
        setStatus("disconnected");
      }
    }) : undefined;
    
    return () => {
      if (typeof offData === "function") offData();
      if (typeof offError === "function") offError();
      if (typeof offClosed === "function") offClosed();
    };
  }, [selectedScale]);

  const connectScale = async () => {
    if (!selectedScale) return;
    setStatus("connecting");
    setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: Connecting to ${selectedScale}...`]);
    
    try {
      const res = await (window as any).serial?.open?.({ path: selectedScale, baudRate: 9600 });
      if (res?.ok) {
        setStatus("connected");
        setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: Connected successfully`]);
      } else {
        setStatus("error");
        setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: Connection failed: ${res?.error}`]);
        if (res?.error) console.error(res.error);
      }
    } catch (e) {
      console.error(e);
      setStatus("error");
      setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: Connection error: ${e}`]);
    }
  };

  const testBaudRates = async () => {
    if (!selectedScale) return;
    setIsTestingBaudRates(true);
    setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: Testing baud rates...`]);
    
    try {
      const res = await (window as any).serial?.testBaudRates?.(selectedScale);
      if (res?.ok) {
        setBaudRateTestResults(res.results);
        const successfulRates = res.results.filter((r: any) => r.success);
        if (successfulRates.length > 0) {
          setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: Found working baud rates: ${successfulRates.map((r: any) => r.baudRate).join(', ')}`]);
        } else {
          setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: No data received at any baud rate`]);
        }
      }
    } catch (e) {
      console.error(e);
      setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: Baud rate test error: ${e}`]);
    } finally {
      setIsTestingBaudRates(false);
    }
  };

  const sendCommand = async () => {
    if (!selectedScale || !commandInput.trim()) return;
    
    setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: Sending command: ${commandInput}`]);
    
    try {
      const res = await (window as any).serial?.sendCommand?.(selectedScale, commandInput);
      if (res?.ok) {
        setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: Command sent successfully`]);
      } else {
        setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: Command failed: ${res?.error}`]);
      }
    } catch (e) {
      console.error(e);
      setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: Command error: ${e}`]);
    }
  };

  const sendENQCommand = async () => {
    if (!selectedScale) return;
    
    setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: Sending ENQ command (0x05)`]);
    
    try {
      const res = await (window as any).serial?.sendCommand?.(selectedScale, String.fromCharCode(0x05));
      if (res?.ok) {
        setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ENQ command sent successfully`]);
      } else {
        setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ENQ command failed: ${res?.error}`]);
      }
    } catch (e) {
      console.error(e);
      setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ENQ command error: ${e}`]);
    }
  };

  const disconnectScale = async () => {
    if (!selectedScale) return;
    try {
      const res = await (window as any).serial?.close?.(selectedScale);
      if (res?.ok) {
        setStatus("disconnected");
      } else {
        setStatus("error");
        if (res?.error) console.error(res.error);
      }
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  };

  return (
    <>
      <ScaleSelector
        availableScales={availableScales}
        selectedScale={selectedScale}
        setSelectedScale={setSelectedScale}
        status={status}
        disabled={false}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={connectScale}
          disabled={!selectedScale || status === "connected" || status === "connecting"}
          className="button"
        >
          Conectar
        </button>
        <button
          onClick={disconnectScale}
          disabled={status !== "connected"}
          className="button"
        >
          Desconectar
        </button>
        {/* <button
          onClick={testBaudRates}
          disabled={!selectedScale || isTestingBaudRates}
          className="button"
        >
          {isTestingBaudRates ? "Probando..." : "Probar Baud Rates"}
        </button> */}
        {/* {status === "connected" && (
          <button
            onClick={sendENQCommand}
            disabled={!selectedScale}
            className="button"
            style={{ backgroundColor: "#007bff" }}
          >
            Send ENQ (0x05)
          </button>
        )} */}
      </div>

      <div className="field" style={{ marginTop: 8 }}>
        <label className="muted">Weight</label>
        <input
          type="text"
          value={scaleWeightData}
          placeholder="Peso leído de la balanza"
          readOnly
          className="input"
        />
      </div>

      {/* Command Input */}
      {status === "connected" && (
        <div className="field" style={{ marginTop: 8 }}>
          <label className="muted">Send Command to Scale</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              placeholder="Enter command (e.g., P, W, ?, STATUS)"
              className="input"
              style={{ flex: 1 }}
            />
            <button
              onClick={sendCommand}
              disabled={!commandInput.trim()}
              className="button"
            >
              Send
            </button>
          </div>
          <div style={{ fontSize: "12px", color: "#666", marginTop: 4 }}>
            Common commands: W (Weight), P (Print), ? (Query), STATUS, \r\n (newline)
            <br />
            <strong>Protocol:</strong> STX/ETX framing with ENQ (0x05) wake-up
          </div>
        </div>
      )}

      {/* Debug Logs */}
      {/* <div className="field" style={{ marginTop: 16 }}>
        <label className="muted">Debug Logs</label>
        <div style={{ 
          height: 120, 
          overflow: "auto", 
          border: "1px solid #ccc", 
          padding: 8, 
          backgroundColor: "#f5f5f5",
          fontFamily: "monospace",
          fontSize: "12px"
        }}>
          {debugLogs.length === 0 ? "No logs yet..." : debugLogs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </div>
      </div> */}

      {/* Baud Rate Test Results */}
      {baudRateTestResults.length > 0 && (
        <div className="field" style={{ marginTop: 16 }}>
          <label className="muted">Baud Rate Test Results</label>
          <div style={{ 
            height: 120, 
            overflow: "auto", 
            border: "1px solid #ccc", 
            padding: 8, 
            backgroundColor: "#f5f5f5",
            fontFamily: "monospace",
            fontSize: "12px"
          }}>
            {baudRateTestResults.map((result, i) => (
              <div key={i} style={{ 
                color: result.success ? "green" : "red",
                marginBottom: 4
              }}>
                {result.baudRate} baud: {result.success ? `✓ ${result.data}` : `✗ ${result.error || 'No data'}`}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default ScaleFetcher;
