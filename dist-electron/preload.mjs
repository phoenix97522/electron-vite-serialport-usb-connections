"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return electron.ipcRenderer.on(
      channel,
      (event, ...args2) => listener(event, ...args2)
    );
  },
  off(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.invoke(channel, ...omit);
  }
  // You can expose other APTs you need here.
  // ...
});
electron.contextBridge.exposeInMainWorld("serial", {
  list: () => electron.ipcRenderer.invoke("serial:list"),
  open: (opts) => electron.ipcRenderer.invoke("serial:open", opts),
  close: (path) => electron.ipcRenderer.invoke("serial:close", path),
  testBaudRates: (path) => electron.ipcRenderer.invoke("serial:test-baud-rates", path),
  sendCommand: (path, command) => electron.ipcRenderer.invoke("serial:send-command", path, command),
  onData: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on("serial:data", listener);
    return () => electron.ipcRenderer.removeListener("serial:data", listener);
  },
  onError: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on("serial:error", listener);
    return () => electron.ipcRenderer.removeListener("serial:error", listener);
  },
  onClosed: (cb) => {
    const listener = (_, payload) => cb(payload);
    electron.ipcRenderer.on("serial:closed", listener);
    return () => electron.ipcRenderer.removeListener("serial:closed", listener);
  }
});
