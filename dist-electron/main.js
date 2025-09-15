var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { ipcMain, app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SerialPort } from "serialport";
import require$$0 from "stream";
var dist$1 = {};
var dist = {};
Object.defineProperty(dist, "__esModule", { value: true });
dist.DelimiterParser = void 0;
const stream_1 = require$$0;
class DelimiterParser extends stream_1.Transform {
  constructor({ delimiter, includeDelimiter = false, ...options }) {
    super(options);
    __publicField(this, "includeDelimiter");
    __publicField(this, "delimiter");
    __publicField(this, "buffer");
    if (delimiter === void 0) {
      throw new TypeError('"delimiter" is not a bufferable object');
    }
    if (delimiter.length === 0) {
      throw new TypeError('"delimiter" has a 0 or undefined length');
    }
    this.includeDelimiter = includeDelimiter;
    this.delimiter = Buffer.from(delimiter);
    this.buffer = Buffer.alloc(0);
  }
  _transform(chunk, encoding, cb) {
    let data = Buffer.concat([this.buffer, chunk]);
    let position;
    while ((position = data.indexOf(this.delimiter)) !== -1) {
      this.push(data.slice(0, position + (this.includeDelimiter ? this.delimiter.length : 0)));
      data = data.slice(position + this.delimiter.length);
    }
    this.buffer = data;
    cb();
  }
  _flush(cb) {
    this.push(this.buffer);
    this.buffer = Buffer.alloc(0);
    cb();
  }
}
dist.DelimiterParser = DelimiterParser;
Object.defineProperty(dist$1, "__esModule", { value: true });
var ReadlineParser_1 = dist$1.ReadlineParser = void 0;
const parser_delimiter_1 = dist;
class ReadlineParser extends parser_delimiter_1.DelimiterParser {
  constructor(options) {
    const opts = {
      delimiter: Buffer.from("\n", "utf8"),
      encoding: "utf8",
      ...options
    };
    if (typeof opts.delimiter === "string") {
      opts.delimiter = Buffer.from(opts.delimiter, opts.encoding);
    }
    super(opts);
  }
}
ReadlineParser_1 = dist$1.ReadlineParser = ReadlineParser;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openPorts = /* @__PURE__ */ new Map();
process.env.APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win = null;
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: fileURLToPath(new URL("./preload.mjs", import.meta.url))
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.log("Failed to load:", errorCode, errorDescription);
  });
  if (VITE_DEV_SERVER_URL) {
    let retryCount = 0;
    const maxRetries = 10;
    const loadDevURL = async () => {
      try {
        await (win == null ? void 0 : win.loadURL(VITE_DEV_SERVER_URL));
        console.log("Successfully loaded dev server");
      } catch (error) {
        retryCount++;
        if (retryCount < maxRetries) {
          console.log(`Retrying to load dev server... (${retryCount}/${maxRetries})`);
          setTimeout(loadDevURL, 2e3);
        } else {
          console.error("Failed to load dev server after maximum retries, falling back to production build");
          win == null ? void 0 : win.loadFile(path.join(RENDERER_DIST, "index.html"));
        }
      }
    };
    setTimeout(loadDevURL, 2e3);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
ipcMain.handle("serial:list", async () => {
  try {
    const ports = await SerialPort.list();
    return { ok: true, ports };
  } catch (err) {
    return { ok: false, error: (err == null ? void 0 : err.message) ?? String(err) };
  }
});
ipcMain.handle("serial:open", async (event, opts) => {
  const { path: path2, baudRate = 9600 } = opts;
  if (openPorts.has(path2)) return { ok: true, message: "already open" };
  try {
    console.log(`Opening port: ${path2} at ${baudRate} baud`);
    const port = new SerialPort({
      path: path2,
      baudRate,
      autoOpen: false,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      flowControl: false
    });
    console.log("Port created:", port);
    let dataBuffer = Buffer.alloc(0);
    let monitorInterval = null;
    port.on("open", () => {
      console.log(`Port ${path2} opened successfully`);
      port.write(Buffer.from([5]));
      console.log("Sent ENQ command to scale");
      monitorInterval = setInterval(() => {
        if (port.isOpen) {
          port.write("W\r\n");
        } else {
          if (monitorInterval) {
            clearInterval(monitorInterval);
            monitorInterval = null;
          }
        }
      }, 50);
    });
    port.on("data", (data) => {
      const dataToStringHex = data.toString("hex");
      const dataAsAscii = data.toString("ascii");
      console.log(`Raw data from ${path2}:`, dataToStringHex, "|", dataAsAscii);
      if (dataToStringHex === "453174") {
        console.log("Received E1t response, sending ENQ command");
        port.write(Buffer.from([5]));
        return;
      }
      dataBuffer = Buffer.concat([dataBuffer, data]);
      let startIndex = dataBuffer.indexOf(2);
      let endIndex = dataBuffer.indexOf(3);
      while (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        const messageBuffer = dataBuffer.slice(startIndex + 1, endIndex);
        const messageString = messageBuffer.toString("ascii");
        console.log(`Complete message from ${path2}:`, messageString);
        const weight = parseScaleData(messageString);
        if (weight !== null) {
          console.log(`Parsed weight: ${weight} kg`);
          event.sender.send("serial:data", { path: path2, data: weight.toString() });
        }
        dataBuffer = dataBuffer.slice(endIndex + 1);
        startIndex = dataBuffer.indexOf(2);
        endIndex = dataBuffer.indexOf(3);
      }
      if (dataBuffer.length > 100) {
        dataBuffer = Buffer.alloc(0);
      }
    });
    port.on("error", (err) => {
      console.log(`Error from ${path2}:`, err.message);
      event.sender.send("serial:error", { path: path2, error: err.message });
    });
    port.on("close", () => {
      console.log(`Closed port: ${path2}`);
      if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
      }
      event.sender.send("serial:closed", { path: path2 });
      openPorts.delete(path2);
    });
    await new Promise((resolve, reject) => {
      port.open((err) => err ? reject(err) : resolve());
    });
    openPorts.set(path2, { port, parser: null });
    return { ok: true };
  } catch (err) {
    console.log("Error opening port:", err);
    return { ok: false, error: (err == null ? void 0 : err.message) ?? String(err) };
  }
});
function parseScaleData(stringData) {
  console.log(`Parsing scale data: "${stringData}"`);
  if (stringData === "E1t") {
    console.log("Received E1t status code");
    return null;
  }
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
ipcMain.handle("serial:close", async (_event, path2) => {
  const entry = openPorts.get(path2);
  if (!entry) return { ok: false, error: "not open" };
  try {
    await new Promise((resolve, reject) => {
      entry.port.close((err) => err ? reject(err) : resolve());
    });
    openPorts.delete(path2);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err == null ? void 0 : err.message) ?? String(err) };
  }
});
ipcMain.handle("serial:test-baud-rates", async (event, path2) => {
  const commonBaudRates = [9600, 1200, 2400, 4800, 19200, 38400, 57600, 115200];
  const results = [];
  for (const baudRate of commonBaudRates) {
    try {
      console.log(`Testing baud rate: ${baudRate}`);
      const port = new SerialPort({
        path: path2,
        baudRate,
        autoOpen: false,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        flowControl: false
      });
      let dataReceived = false;
      let timeout;
      const parser = port.pipe(new ReadlineParser_1({
        delimiter: ["\r\n", "\r", "\n", "", ""],
        includeDelimiter: false
      }));
      parser.on("data", (line) => {
        console.log(`Data received at ${baudRate} baud:`, line);
        dataReceived = true;
        clearTimeout(timeout);
        results.push({ baudRate, success: true, data: line });
      });
      port.on("error", (err) => {
        console.log(`Error at ${baudRate} baud:`, err.message);
        clearTimeout(timeout);
      });
      await new Promise((resolve, reject) => {
        port.open((err) => err ? reject(err) : resolve());
      });
      await new Promise((resolve) => {
        timeout = setTimeout(() => {
          if (!dataReceived) {
            results.push({ baudRate, success: false, data: null });
          }
          resolve();
        }, 2e3);
      });
      await new Promise((resolve) => {
        port.close((err) => resolve());
      });
    } catch (err) {
      console.log(`Failed to test ${baudRate} baud:`, err);
      results.push({ baudRate, success: false, error: err == null ? void 0 : err.message });
    }
  }
  return { ok: true, results };
});
ipcMain.handle("serial:send-command", async (event, path2, command) => {
  const entry = openPorts.get(path2);
  if (!entry) return { ok: false, error: "Port not open" };
  try {
    console.log(`Sending command to ${path2}: ${JSON.stringify(command)}`);
    await new Promise((resolve, reject) => {
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
  } catch (err) {
    console.log(`Failed to send command: ${err.message}`);
    return { ok: false, error: (err == null ? void 0 : err.message) ?? String(err) };
  }
});
app.on("before-quit", () => {
  for (const { port } of openPorts.values()) {
    try {
      port.close();
    } catch {
    }
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
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
