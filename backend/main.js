const { app, BrowserWindow } = require("electron");
const path = require("path");

// require("ts-node/register"); // Le enseña a Electron a compilar TypeScript al vuelo
require("./dist/server.js");
function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 850,
    autoHideMenuBar: true, // Oculta los menús de "Archivo, Edición" típicos del navegador
    icon: path.join(__dirname, "public", "logo.png"), // Para que tenga el diamante de ícono
  });

  // 2. Le decimos a la ventana que cargue tu sistema directamente
  win.loadURL("http://localhost:3001");

  // Opcional: Para que inicie maximizada
  win.maximize();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
