// En tu archivo principal de ELECTRON (backend/src/main.ts o index.js)
const { app, BrowserWindow, ipcMain, dialog } = require('electron'); // <-- AGREGAR ipcMain, dialog
const fs = require('fs'); // Módulo para archivos
const path = require('path');
// Magia: Le pasamos al backend la ruta segura de Windows (AppData)
process.env.USER_DATA_PATH = app.getPath("userData");

require("./dist/server.js");

function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 850,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "logo.ico"),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Usamos IP estricta para que el Firewall de Windows no nos bloquee
  win.loadURL("http://127.0.0.1:3001");
  win.maximize();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// --- NUEVO BLOQUE PARA GENERAR PDF NATIVO ---
ipcMain.handle('generar-pdf-nativo', async (event, { nombreArchivo }) => {
  const webContents = event.sender;
  const focusWindow = BrowserWindow.fromWebContents(webContents);

  // 1. Preguntamos al usuario dónde guardar
  const { filePath } = await dialog.showSaveDialog(focusWindow, {
    title: 'Guardar PDF',
    defaultPath: path.join(app.getPath('documents'), `${nombreArchivo}.pdf`),
    filters: [{ name: 'Documento PDF', extensions: ['pdf'] }]
  });

  if (!filePath) return false; // Usuario canceló

  try {
    // 🪄 LA MAGIA: Generar PDF directamente usando CSS print y pie de página
    const data = await webContents.printToPDF({
      printBackground: true,
      displayHeaderFooter: true, // Activamos encabezado y pie de página
      headerTemplate: '<span></span>', // Vacío para que no ponga la fecha arriba
      footerTemplate: '<div style="width: 100%; text-align: right; font-size: 11px; padding-right: 20px; font-family: Arial, sans-serif; color: #555;">Hoja <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
      margins: { marginType: 'default' }, // Dejamos que Electron calcule el espacio para el pie
      pageSize: 'A4',
      landscape: false
    });

    fs.writeFileSync(filePath, data); // Guardamos el archivo
    return true; // Éxito
  } catch (error) {
    console.error('Error generando PDF:', error);
    return false;
  }
});
// ------------------------------------------