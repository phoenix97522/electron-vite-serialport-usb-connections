// main.ts
import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openPorts =  new Map<String, {port: SerialPort, parser: ReadlineParser | null}>();

// Estructura de builds
process.env.APP_ROOT = path.join(__dirname, "..");

// Vite / rutas
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT!, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT!, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT!, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC!, "electron-vite.svg"),
    webPreferences: {
      preload: fileURLToPath(new URL("./preload.mjs", import.meta.url)),
    },
  });

  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.log('Failed to load:', errorCode, errorDescription);
  });

  if (VITE_DEV_SERVER_URL) {
    // Add retry mechanism for development server
    let retryCount = 0;
    const maxRetries = 10;
    const loadDevURL = async () => {
      try {
        await win?.loadURL(VITE_DEV_SERVER_URL);
        console.log('Successfully loaded dev server');
      } catch (error) {
        retryCount++;
        if (retryCount < maxRetries) {
          console.log(`Retrying to load dev server... (${retryCount}/${maxRetries})`);
          setTimeout(loadDevURL, 2000);
        } else {
          console.error('Failed to load dev server after maximum retries, falling back to production build');
          win?.loadFile(path.join(RENDERER_DIST, "index.html"));
        }
      }
    };
    // Wait a bit for Vite to be fully ready
    setTimeout(loadDevURL, 2000);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

ipcMain.handle("serial:list", async () => {
  try {
    const ports = await SerialPort.list();
    return { ok: true, ports };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
});

ipcMain.handle("serial:open", async (event, opts: { path: string; baudRate?: number }) => {
  const { path, baudRate = 9600 } = opts;
  if (openPorts.has(path)) return { ok: true, message: "already open" };

  try {
    console.log(`Opening port: ${path} at ${baudRate} baud`);
    
    const port = new SerialPort({ 
      path, 
      baudRate, 
      autoOpen: false,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: false
    });
    
    console.log("Port created:", port);
    
    // Data buffer for STX/ETX protocol
    let dataBuffer = Buffer.alloc(0);
    let monitorInterval: NodeJS.Timeout | null = null;

    port.on("open", () => {
      console.log(`Port ${path} opened successfully`);
      
      // Send ENQ command to request weight (as per your working code)
      port.write(Buffer.from([0x05])); // ENQ
      console.log("Sent ENQ command to scale");
      
      // Start periodic monitoring (every 50ms as in your working code)
      monitorInterval = setInterval(() => {
        if (port.isOpen) {
          port.write("W\r\n"); // Request weight periodically
        } else {
          if (monitorInterval) {
            clearInterval(monitorInterval);
            monitorInterval = null;
          }
        }
      }, 50);
    });

    // Single data listener with STX/ETX protocol parsing
    port.on("data", (data: Buffer) => {
      const dataToStringHex = data.toString("hex");
      const dataAsAscii = data.toString("ascii");
      
      console.log(`Raw data from ${path}:`, dataToStringHex, '|', dataAsAscii);
      
      // Check for "E1t" response (as per your working code)
      if (dataToStringHex === "453174") {
        console.log("Received E1t response, sending ENQ command");
        port.write(Buffer.from([0x05])); // ENQ
        return;
      }

      // Accumulate data in buffer
      dataBuffer = Buffer.concat([dataBuffer, data]);

      // Look for complete STX...ETX messages
      let startIndex = dataBuffer.indexOf(0x02); // STX
      let endIndex = dataBuffer.indexOf(0x03); // ETX

      while (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        // Extract complete message
        const messageBuffer = dataBuffer.slice(startIndex + 1, endIndex); // Without STX/ETX
        const messageString = messageBuffer.toString("ascii");
        
        console.log(`Complete message from ${path}:`, messageString);

        // Parse the weight data
        const weight = parseScaleData(messageString);
        
        if (weight !== null) {
          console.log(`Parsed weight: ${weight} kg`);
          event.sender.send("serial:data", { path, data: weight.toString() });
        }

        // Remove processed message from buffer
        dataBuffer = dataBuffer.slice(endIndex + 1);

        // Look for next message
        startIndex = dataBuffer.indexOf(0x02);
        endIndex = dataBuffer.indexOf(0x03);
      }

      // Clean buffer if it gets too large
      if (dataBuffer.length > 100) {
        dataBuffer = Buffer.alloc(0);
      }
    });

    port.on("error", (err) => {
      console.log(`Error from ${path}:`, err.message);
      event.sender.send("serial:error", { path, error: err.message });
    });

    port.on("close", () => {
      console.log(`Closed port: ${path}`);
      if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
      }
      event.sender.send("serial:closed", { path });
      openPorts.delete(path);
    });

    await new Promise<void>((resolve, reject) => {
      port.open((err) => (err ? reject(err) : resolve()));
    });

    openPorts.set(path, { port, parser: null }); // No parser needed with STX/ETX protocol
    return { ok: true };
  } catch (err: any) {
    console.log("Error opening port:", err);
    return { ok: false, error: err?.message ?? String(err) };
  }
});

// Scale data parsing function based on your working code
function parseScaleData(stringData: string): number | null {
  console.log(`Parsing scale data: "${stringData}"`);
  
  // If you receive "E1t", it might be a status code or command
  if (stringData === "E1t") {
    console.log("Received E1t status code");
    return null;
  }

  // Try to extract numeric weight
  const weightMatch = stringData.match(/(-?\d+\.?\d*)/);
  if (weightMatch) {
    const weight = parseFloat(weightMatch[1]);
    console.log(`Extracted weight: ${weight}`);
    return weight;
  } else {
    console.log(`No numeric weight found in: "${stringData}"`);
    return null;
  }
}

ipcMain.handle("serial:close", async (_event, path: string) => {
  const entry = openPorts.get(path);
  if (!entry) return { ok: false, error: "not open" };
  try {
    await new Promise<void>((resolve, reject) => {
      entry.port.close((err) => (err ? reject(err) : resolve()));
    });
    openPorts.delete(path);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
});

// Add function to test different baud rates
ipcMain.handle("serial:test-baud-rates", async (event, path: string) => {
  const commonBaudRates = [9600, 1200, 2400, 4800, 19200, 38400, 57600, 115200];
  const results = [];
  
  for (const baudRate of commonBaudRates) {
    try {
      console.log(`Testing baud rate: ${baudRate}`);
      
      const port = new SerialPort({ 
        path, 
        baudRate, 
        autoOpen: false,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: false
      });
      
      let dataReceived = false;
      let timeout: NodeJS.Timeout;
      
      const parser = port.pipe(new ReadlineParser({ 
        delimiter: ["\r\n", "\r", "\n", "\x03", "\x04"],
        includeDelimiter: false 
      }));
      
      parser.on("data", (line: string) => {
        console.log(`Data received at ${baudRate} baud:`, line);
        dataReceived = true;
        clearTimeout(timeout);
        results.push({ baudRate, success: true, data: line });
      });
      
      port.on("error", (err) => {
        console.log(`Error at ${baudRate} baud:`, err.message);
        clearTimeout(timeout);
      });
      
      await new Promise<void>((resolve, reject) => {
        port.open((err) => (err ? reject(err) : resolve()));
      });
      
      // Wait 2 seconds for data
      await new Promise<void>((resolve) => {
        timeout = setTimeout(() => {
          if (!dataReceived) {
            results.push({ baudRate, success: false, data: null });
          }
          resolve();
        }, 2000);
      });
      
      await new Promise<void>((resolve) => {
        port.close((err) => resolve());
      });
      
    } catch (err) {
      console.log(`Failed to test ${baudRate} baud:`, err);
      results.push({ baudRate, success: false, error: err?.message });
    }
  }
  
  return { ok: true, results };
});

// Add function to send commands to the scale
ipcMain.handle("serial:send-command", async (event, path: string, command: string) => {
  const entry = openPorts.get(path);
  if (!entry) return { ok: false, error: "Port not open" };
  
  try {
    console.log(`Sending command to ${path}: ${JSON.stringify(command)}`);
    
    await new Promise<void>((resolve, reject) => {
      entry.port.write(command, (err) => {
        if (err) {
          console.log(`Error sending command: ${err.message}`);
          reject(err);
        } else {
          console.log(`Command sent successfully`);
          resolve();
        }
      });
    });
    
    return { ok: true };
  } catch (err: any) {
    console.log(`Failed to send command: ${err.message}`);
    return { ok: false, error: err?.message ?? String(err) };
  }
});



app.on("before-quit", () => {
  for (const { port } of openPorts.values()) {
    try { port.close(); } catch { /* ignore */ }
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.whenReady().then(createWindow);
