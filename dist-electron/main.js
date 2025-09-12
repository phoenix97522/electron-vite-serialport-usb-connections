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
    const port = new SerialPort({ path: path2, baudRate, autoOpen: false });
    const parser = port.pipe(new ReadlineParser_1({ delimiter: "\r\n" }));
    parser.on("data", (line) => {
      event.sender.send("serial:data", { path: path2, data: line });
    });
    port.on("error", (err) => {
      event.sender.send("serial:error", { path: path2, error: err.message });
    });
    port.on("close", () => {
      event.sender.send("serial:closed", { path: path2 });
      openPorts.delete(path2);
    });
    await new Promise((resolve, reject) => {
      port.open((err) => err ? reject(err) : resolve());
    });
    openPorts.set(path2, { port, parser });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err == null ? void 0 : err.message) ?? String(err) };
  }
});
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
