const { app, BrowserWindow } = require("electron");
const path = require("path");

// Magia: Le pasamos al backend la ruta segura de Windows (AppData)
process.env.USER_DATA_PATH = app.getPath("userData");

require("./dist/server.js");

function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 850,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "logo.ico"),
  });

  // Usamos IP estricta para que el Firewall de Windows no nos bloquee
  win.loadURL("http://127.0.0.1:3001");
  win.maximize();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
