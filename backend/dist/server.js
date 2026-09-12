"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const app = (0, express_1.default)();
// ============================================================
// CARGA DE CONFIGURACIÓN CENTRAL (AHORA DINÁMICA)
// ============================================================
// 1. Definimos la ruta segura (AppData en prod, o la carpeta del proyecto en dev)
const rutaSegura = process.env.USER_DATA_PATH || path_1.default.join(__dirname, "..");
// 2. Dónde está el config de fábrica y dónde va a vivir el editable
const rutaConfigOriginal = path_1.default.join(__dirname, "..", "config.json");
const rutaConfigDinamica = path_1.default.join(rutaSegura, "config.json");
let CONFIG = {};
try {
    // 3. Si no existe en AppData (primera vez que se abre el instalador), lo copiamos
    if (!fs_1.default.existsSync(rutaConfigDinamica)) {
        if (fs_1.default.existsSync(rutaConfigOriginal)) {
            fs_1.default.copyFileSync(rutaConfigOriginal, rutaConfigDinamica);
        }
        else {
            fs_1.default.writeFileSync(rutaConfigDinamica, "{}");
        }
    }
    // 4. Leemos siempre desde la ruta dinámica (editable)
    const raw = fs_1.default.readFileSync(rutaConfigDinamica, "utf-8");
    CONFIG = JSON.parse(raw);
    console.log(`✅ Config cargada: ${CONFIG.negocio?.nombre}`);
}
catch (e) {
    console.error("❌ No se pudo inicializar config.json:", e);
    process.exit(1);
}
const PORT = CONFIG.app?.puerto || 3001;
// Middlewares
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Variable global para la base de datos
let db;
const dbPath = path_1.default.join(rutaSegura, CONFIG.app?.nombreBD || "stock-app.sqlite");
// ============================================================
// INICIALIZACIÓN DE BASE DE DATOS
// ============================================================
async function inicializarDB() {
    try {
        db = await (0, sqlite_1.open)({
            filename: dbPath,
            driver: sqlite3_1.default.Database,
        });
        console.log("✅ Base de datos SQLite conectada.");
        await db.exec(`
      CREATE TABLE IF NOT EXISTS Productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE,
        categoria TEXT,
        material TEXT,
        medida TEXT,
        nombre TEXT,
        precio REAL,
        stock_real INTEGER,
        stock_disponible INTEGER
      );

      CREATE TABLE IF NOT EXISTS Vendedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        telefono TEXT
      );

      CREATE TABLE IF NOT EXISTS Remitos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendedor_id INTEGER,
        fecha_salida TEXT NOT NULL,
        estado TEXT DEFAULT 'Pendiente',
        FOREIGN KEY(vendedor_id) REFERENCES Vendedores(id)
      );

      CREATE TABLE IF NOT EXISTS Remitos_Items (
        remito_id INTEGER,
        producto_id INTEGER,
        cantidad_entregada INTEGER DEFAULT 0,
        cantidad_devuelta INTEGER DEFAULT 0,
        cantidad_vendida INTEGER DEFAULT 0,
        PRIMARY KEY (remito_id, producto_id),
        FOREIGN KEY(remito_id) REFERENCES Remitos(id),
        FOREIGN KEY(producto_id) REFERENCES Productos(id)
      );

      CREATE TABLE IF NOT EXISTS Pagos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        remito_id INTEGER,
        monto REAL NOT NULL,
        fecha TEXT NOT NULL,
        FOREIGN KEY(remito_id) REFERENCES Remitos(id)
      );
    `);
        // Migraciones seguras (ignoran error si la columna ya existe)
        const migraciones = [
            `ALTER TABLE Productos ADD COLUMN medida TEXT;`,
            `ALTER TABLE Remitos ADD COLUMN comision REAL DEFAULT 0;`,
            `ALTER TABLE Remitos_Items ADD COLUMN precio REAL DEFAULT 0;`, // <-- NUEVA
            `ALTER TABLE Remitos ADD COLUMN total_rendir REAL DEFAULT 0;`, // <-- NUEVA
            `ALTER TABLE Remitos ADD COLUMN abonado REAL DEFAULT 0;`, // <-- NUEVA
        ];
        for (const m of migraciones) {
            try {
                await db.exec(m);
            }
            catch (_) { }
        }
        console.log("📦 Tablas sincronizadas correctamente.");
    }
    catch (error) {
        console.error("❌ Error al conectar con la base de datos:", error);
    }
}
inicializarDB();
// ============================================================
// RUTA DE CONFIGURACIÓN — El frontend la consume al arrancar
// ============================================================
app.get("/api/config", (req, res) => {
    res.json(CONFIG);
});
// Guardar nueva configuración desde el frontend
app.post("/api/config", (req, res) => {
    try {
        const nuevaConfig = req.body;
        // Sobrescribimos el archivo físico
        fs_1.default.writeFileSync(rutaConfigDinamica, JSON.stringify(nuevaConfig, null, 2), "utf-8");
        // Actualizamos la variable en memoria del servidor
        CONFIG = nuevaConfig;
        res.json({ mensaje: "Configuración actualizada correctamente" });
    }
    catch (error) {
        console.error("Error al guardar config:", error);
        res.status(500).json({ error: "Error al guardar la configuración" });
    }
});
app.get("/api/status", (req, res) => {
    res.json({
        mensaje: "Servidor funcionando correctamente.",
        negocio: CONFIG.negocio?.nombre,
    });
});
// ============================================================
// RUTAS DE PRODUCTOS
// ============================================================
app.get("/api/productos", async (req, res) => {
    try {
        const productos = await db.all("SELECT * FROM Productos");
        // Buscamos quién tiene qué cosa en remitos pendientes
        const distribuciones = await db.all(`
      SELECT ri.producto_id, (ri.cantidad_entregada - ri.cantidad_vendida - ri.cantidad_devuelta) as cantidad, v.nombre as vendedor
      FROM Remitos_Items ri
      JOIN Remitos r ON ri.remito_id = r.id
      JOIN Vendedores v ON r.vendedor_id = v.id
      WHERE r.estado = 'Pendiente' AND (ri.cantidad_entregada - ri.cantidad_vendida - ri.cantidad_devuelta) > 0
    `);
        // Lo agrupamos por producto
        const distMap = {};
        for (const d of distribuciones) {
            if (!distMap[d.producto_id])
                distMap[d.producto_id] = [];
            distMap[d.producto_id].push({
                vendedor: d.vendedor,
                cantidad: d.cantidad,
            });
        }
        // Se lo metemos al producto final
        const response = productos.map((p) => ({
            ...p,
            distribucion: distMap[p.id] || [],
        }));
        res.json(response);
    }
    catch (error) {
        res.status(500).json({ error: "Error al obtener los productos" });
    }
});
app.post("/api/productos", async (req, res) => {
    const categoria = req.body.categoria || "";
    const material = req.body.material || "";
    const medida = req.body.medida || "";
    const nombre = req.body.nombre || "";
    const precio = req.body.precio || 0;
    const stock_real = req.body.stock_real || 0;
    // Buscamos el prefijo en la config
    const cats = CONFIG.inventario?.categorias || [];
    const catConfig = cats.find((c) => c.nombre === categoria);
    const prefijo = catConfig?.prefijo || "OT";
    try {
        const row = await db.get(`SELECT codigo FROM Productos WHERE codigo LIKE ? ORDER BY CAST(SUBSTR(codigo, ${prefijo.length + 1}) AS INTEGER) DESC LIMIT 1`, [`${prefijo}%`]);
        let nuevoNumero = 1;
        if (row?.codigo) {
            const n = parseInt(row.codigo.substring(prefijo.length));
            if (!isNaN(n))
                nuevoNumero = n + 1;
        }
        const codigoGenerado = `${prefijo}${nuevoNumero.toString().padStart(2, "0")}`;
        const result = await db.run(`INSERT INTO Productos (codigo, categoria, material, medida, nombre, precio, stock_real, stock_disponible)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
            codigoGenerado,
            categoria,
            material,
            medida,
            nombre,
            precio,
            stock_real,
            stock_real,
        ]);
        res.json({
            id: result.lastID,
            codigo: codigoGenerado,
            mensaje: "Producto creado",
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al crear el producto" });
    }
});
app.post("/api/productos/masivo", async (req, res) => {
    const { productos } = req.body;
    if (!productos || !Array.isArray(productos) || productos.length === 0) {
        return res
            .status(400)
            .json({ error: "No se recibieron productos válidos." });
    }
    const cats = CONFIG.inventario?.categorias || [];
    try {
        await db.run("BEGIN TRANSACTION");
        let creados = 0;
        for (const prod of productos) {
            const categoria = prod.categoria || "";
            const catConfig = cats.find((c) => c.nombre === categoria);
            const prefijo = catConfig?.prefijo || "OT";
            const row = await db.get(`SELECT codigo FROM Productos WHERE codigo LIKE ? ORDER BY CAST(SUBSTR(codigo, ${prefijo.length + 1}) AS INTEGER) DESC LIMIT 1`, [`${prefijo}%`]);
            let nuevoNumero = 1;
            if (row?.codigo) {
                const n = parseInt(row.codigo.substring(prefijo.length));
                if (!isNaN(n))
                    nuevoNumero = n + 1;
            }
            const codigoGenerado = `${prefijo}${nuevoNumero.toString().padStart(2, "0")}`;
            const stock = Number(prod.stock) || 0;
            await db.run(`INSERT INTO Productos (codigo, categoria, material, medida, nombre, precio, stock_real, stock_disponible)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                codigoGenerado,
                categoria,
                prod.material || "",
                prod.medida || "",
                prod.nombre || "",
                Number(prod.precio) || 0,
                stock,
                stock,
            ]);
            creados++;
        }
        await db.run("COMMIT");
        res.json({
            mensaje: `Se importaron ${creados} productos exitosamente al inventario.`,
        });
    }
    catch (error) {
        await db.run("ROLLBACK");
        console.error(error);
        res
            .status(500)
            .json({ error: "Error al importar los productos masivamente." });
    }
});
app.put("/api/productos/aumento-masivo", async (req, res) => {
    const { ids, porcentaje } = req.body;
    if (!ids || ids.length === 0 || !porcentaje) {
        return res
            .status(400)
            .json({ error: "Faltan datos para el aumento masivo" });
    }
    try {
        const multiplicador = 1 + porcentaje / 100;
        const placeholders = ids.map(() => "?").join(",");
        await db.run(`UPDATE Productos SET precio = ROUND(precio * ?, 2) WHERE id IN (${placeholders})`, [multiplicador, ...ids]);
        res.json({ mensaje: "Precios actualizados correctamente" });
    }
    catch (error) {
        res.status(500).json({ error: "Error al aplicar el aumento masivo" });
    }
});
app.put("/api/productos/:id", async (req, res) => {
    const { codigo, categoria, material, medida, nombre, precio, stock_real } = req.body;
    const productoId = req.params.id;
    try {
        const productoViejo = await db.get(`SELECT stock_real, stock_disponible FROM Productos WHERE id = ?`, [productoId]);
        if (!productoViejo)
            return res.status(404).json({ error: "Producto no encontrado" });
        const diferencia = stock_real - productoViejo.stock_real;
        const nuevoStockDisponible = productoViejo.stock_disponible + diferencia;
        if (nuevoStockDisponible < 0) {
            return res.status(400).json({
                error: "No podés reducir tanto el stock. Hay unidades de este producto en remitos activos.",
            });
        }
        await db.run(`UPDATE Productos SET codigo=?, categoria=?, material=?, medida=?, nombre=?, precio=?, stock_real=?, stock_disponible=? WHERE id=?`, [
            codigo,
            categoria,
            material,
            medida,
            nombre,
            precio,
            stock_real,
            nuevoStockDisponible,
            productoId,
        ]);
        res.json({ mensaje: "Producto actualizado correctamente" });
    }
    catch (error) {
        if (error.code === "SQLITE_CONSTRAINT") {
            res
                .status(400)
                .json({ error: "El código ingresado ya pertenece a otro producto." });
        }
        else {
            res.status(500).json({ error: "Error al actualizar el producto" });
        }
    }
});
app.delete("/api/productos/:id", async (req, res) => {
    try {
        await db.run(`DELETE FROM Productos WHERE id = ?`, [req.params.id]);
        res.json({ mensaje: "Producto eliminado correctamente" });
    }
    catch (error) {
        res.status(500).json({
            error: "No se puede eliminar. El producto ya está incluido en un remito.",
        });
    }
});
// ============================================================
// RUTAS DE VENDEDORES
// ============================================================
app.get("/api/vendedores", async (req, res) => {
    try {
        const vendedores = await db.all("SELECT * FROM Vendedores");
        res.json(vendedores);
    }
    catch (error) {
        res.status(500).json({ error: "Error al obtener los vendedores" });
    }
});
app.post("/api/vendedores", async (req, res) => {
    const { nombre, telefono } = req.body;
    if (!nombre)
        return res.status(400).json({ error: "El nombre es obligatorio" });
    try {
        const result = await db.run(`INSERT INTO Vendedores (nombre, telefono) VALUES (?, ?)`, [nombre, telefono || ""]);
        res
            .status(201)
            .json({ mensaje: "Vendedor creado exitosamente", id: result.lastID });
    }
    catch (error) {
        res.status(500).json({ error: "Error interno al crear el vendedor" });
    }
});
app.put("/api/vendedores/:id", async (req, res) => {
    const { nombre, telefono } = req.body;
    try {
        await db.run(`UPDATE Vendedores SET nombre=?, telefono=? WHERE id=?`, [
            nombre,
            telefono,
            req.params.id,
        ]);
        res.json({ mensaje: "Vendedor actualizado correctamente" });
    }
    catch (error) {
        res.status(500).json({ error: "Error al actualizar el vendedor" });
    }
});
app.delete("/api/vendedores/:id", async (req, res) => {
    try {
        await db.run(`DELETE FROM Vendedores WHERE id = ?`, [req.params.id]);
        res.json({ mensaje: "Vendedor eliminado correctamente" });
    }
    catch (error) {
        res.status(500).json({
            error: "No se puede eliminar. El vendedor ya tiene remitos asociados.",
        });
    }
});
// ============================================================
// LIQUIDACIÓN POR VENDEDORA (varios remitos, por código)
// ============================================================
// Trae los remitos PENDIENTES de una vendedora con lo que tiene afuera
app.get("/api/vendedores/:id/pendientes", async (req, res) => {
    try {
        const filas = await db.all(`SELECT r.id as remito_id, r.fecha_salida,
              ri.producto_id, p.codigo, p.nombre,
              CASE WHEN ri.precio > 0 THEN ri.precio ELSE p.precio END as precio,
              (ri.cantidad_entregada - ri.cantidad_vendida - ri.cantidad_devuelta) as pendiente
       FROM Remitos r
       JOIN Remitos_Items ri ON ri.remito_id = r.id
       JOIN Productos p ON p.id = ri.producto_id
       WHERE r.vendedor_id = ? AND r.estado = 'Pendiente'
         AND (ri.cantidad_entregada - ri.cantidad_vendida - ri.cantidad_devuelta) > 0
       ORDER BY r.fecha_salida ASC, r.id ASC, p.codigo ASC`, [req.params.id]);
        const mapa = {};
        for (const f of filas) {
            if (!mapa[f.remito_id]) {
                mapa[f.remito_id] = {
                    remito_id: f.remito_id,
                    fecha_salida: f.fecha_salida,
                    items: [],
                };
            }
            mapa[f.remito_id].items.push({
                producto_id: f.producto_id,
                codigo: f.codigo,
                nombre: f.nombre,
                precio: f.precio,
                pendiente: f.pendiente,
            });
        }
        res.json(Object.values(mapa));
    }
    catch (error) {
        res.status(500).json({ error: "Error al obtener remitos pendientes." });
    }
});
// Liquida (cierra) varios remitos de la vendedora en una sola transacción
app.post("/api/vendedores/:id/liquidar", async (req, res) => {
    const vendedorId = Number(req.params.id);
    const { comision, remitos } = req.body;
    if (!remitos || !Array.isArray(remitos) || remitos.length === 0) {
        return res
            .status(400)
            .json({ error: "No se seleccionaron remitos para liquidar." });
    }
    try {
        await db.run("BEGIN TRANSACTION");
        let totalRendirGlobal = 0;
        for (const remito of remitos) {
            const cab = await db.get(`SELECT id, estado, vendedor_id FROM Remitos WHERE id = ?`, [remito.remito_id]);
            if (!cab || cab.vendedor_id !== vendedorId) {
                throw new Error(`El remito ${remito.remito_id} no pertenece a esta vendedora.`);
            }
            if (cab.estado !== "Pendiente") {
                throw new Error(`El remito ${remito.remito_id} ya está cerrado.`);
            }
            // Lo que el front dice que se devolvió de cada producto
            const devMap = {};
            for (const it of remito.items || []) {
                devMap[it.producto_id] = Number(it.cantidad_devuelta) || 0;
            }
            // Procesamos TODOS los items del remito (no solo los que mandó el front)
            const itemsDb = await db.all(`SELECT ri.producto_id, ri.cantidad_entregada,
                CASE WHEN ri.precio > 0 THEN ri.precio ELSE p.precio END as precio
         FROM Remitos_Items ri JOIN Productos p ON p.id = ri.producto_id
         WHERE ri.remito_id = ?`, [remito.remito_id]);
            let totalRendirRemito = 0;
            for (const it of itemsDb) {
                let devuelta = devMap[it.producto_id] || 0;
                if (devuelta < 0)
                    devuelta = 0;
                if (devuelta > it.cantidad_entregada)
                    devuelta = it.cantidad_entregada;
                const vendida = it.cantidad_entregada - devuelta; // lo que no volvió = vendido
                await db.run(`UPDATE Remitos_Items SET cantidad_devuelta=?, cantidad_vendida=? WHERE remito_id=? AND producto_id=?`, [devuelta, vendida, remito.remito_id, it.producto_id]);
                await db.run(`UPDATE Productos SET stock_disponible = stock_disponible + ?, stock_real = stock_real - ? WHERE id = ?`, [devuelta, vendida, it.producto_id]);
                if (vendida > 0) {
                    const descuento = it.precio * ((comision || 0) / 100);
                    totalRendirRemito += (it.precio - descuento) * vendida;
                }
            }
            await db.run(`UPDATE Remitos SET estado='Cerrado', comision=?, total_rendir=?,
         abonado=(SELECT COALESCE(SUM(monto),0) FROM Pagos WHERE remito_id=Remitos.id)
         WHERE id=?`, [comision || 0, totalRendirRemito, remito.remito_id]);
            totalRendirGlobal += totalRendirRemito;
        }
        await db.run("COMMIT");
        res.json({
            mensaje: "Liquidación realizada correctamente.",
            total_rendir: totalRendirGlobal,
        });
    }
    catch (error) {
        await db.run("ROLLBACK");
        console.error(error);
        res
            .status(500)
            .json({ error: error.message || "Error al liquidar la vendedora." });
    }
});
// ============================================================
// RUTAS DE REMITOS
// ============================================================
app.post("/api/remitos", async (req, res) => {
    const { vendedor_id, items } = req.body;
    if (!vendedor_id || !items || items.length === 0) {
        return res
            .status(400)
            .json({ error: "Faltan datos para crear el remito." });
    }
    try {
        await db.run("BEGIN TRANSACTION");
        const resultRemito = await db.run(`INSERT INTO Remitos (vendedor_id, fecha_salida) VALUES (?, date('now'))`, [vendedor_id]);
        const remitoId = resultRemito.lastID;
        for (const item of items) {
            await db.run(`INSERT INTO Remitos_Items (remito_id, producto_id, cantidad_entregada, precio) VALUES (?, ?, ?, ?)`, [remitoId, item.producto_id, item.cantidad, item.precio]);
            await db.run(`UPDATE Productos SET stock_disponible = stock_disponible - ? WHERE id = ?`, [item.cantidad, item.producto_id]);
        }
        await db.run("COMMIT");
        res
            .status(201)
            .json({ mensaje: "Remito generado con éxito", remito_id: remitoId });
    }
    catch (error) {
        await db.run("ROLLBACK");
        res.status(500).json({ error: "Error interno al generar el remito" });
    }
});
app.get("/api/remitos", async (req, res) => {
    try {
        const remitos = await db.all(`
      SELECT r.id, r.fecha_salida, r.estado, r.vendedor_id, r.comision, r.total_rendir, r.abonado, v.nombre as vendedor
      FROM Remitos r
      JOIN Vendedores v ON r.vendedor_id = v.id
    `);
        res.json(remitos);
    }
    catch (error) {
        res.status(500).json({ error: "Error al obtener los remitos" });
    }
});
app.get("/api/remitos/:id/items", async (req, res) => {
    try {
        const items = await db.all(`SELECT ri.producto_id, ri.cantidad_entregada, ri.cantidad_vendida, ri.cantidad_devuelta, 
              CASE WHEN ri.precio > 0 THEN ri.precio ELSE p.precio END as precio,
              p.nombre, p.codigo, p.categoria, p.material
       FROM Remitos_Items ri
       JOIN Productos p ON ri.producto_id = p.id
       WHERE ri.remito_id = ?`, [req.params.id]);
        res.json(items);
    }
    catch (error) {
        res.status(500).json({ error: "Error al obtener los items del remito" });
    }
});
app.put("/api/remitos/:id/cerrar", async (req, res) => {
    const remitoId = req.params.id;
    const { items, comision, total_rendir } = req.body; // <-- AHORA RECIBE EL TOTAL
    try {
        await db.run("BEGIN TRANSACTION");
        await db.run(`UPDATE Remitos SET estado='Cerrado', comision=?, total_rendir=?,
       abonado=(SELECT COALESCE(SUM(monto),0) FROM Pagos WHERE remito_id=Remitos.id)
       WHERE id=?`, [comision || 0, total_rendir || 0, remitoId]);
        for (const item of items) {
            await db.run(`UPDATE Remitos_Items SET cantidad_devuelta=?, cantidad_vendida=? WHERE remito_id=? AND producto_id=?`, [
                item.cantidad_devuelta,
                item.cantidad_vendida,
                remitoId,
                item.producto_id,
            ]);
            await db.run(`UPDATE Productos SET stock_disponible = stock_disponible + ?, stock_real = stock_real - ? WHERE id = ?`, [item.cantidad_devuelta, item.cantidad_vendida, item.producto_id]);
        }
        await db.run("COMMIT");
        res.json({ mensaje: "Remito cerrado y stock actualizado correctamente" });
    }
    catch (error) {
        await db.run("ROLLBACK");
        res.status(500).json({ error: "Error al cerrar el remito" });
    }
});
// REGISTRAR PAGO PARCIAL A UN REMITO CERRADO
app.put("/api/remitos/:id/pagar", async (req, res) => {
    const remitoId = req.params.id;
    const { monto } = req.body;
    if (!monto || monto <= 0)
        return res.status(400).json({ error: "Monto inválido" });
    try {
        await db.run("BEGIN TRANSACTION");
        // 1. Sumamos al total abonado
        await db.run(`UPDATE Remitos SET abonado = abonado + ? WHERE id=?`, [
            monto,
            remitoId,
        ]);
        // 2. Guardamos el registro histórico del pago con fecha y hora
        await db.run(`INSERT INTO Pagos (remito_id, monto, fecha) VALUES (?, ?, ?)`, [remitoId, monto, new Date().toISOString()]);
        await db.run("COMMIT");
        res.json({ mensaje: "Pago registrado y guardado en el historial" });
    }
    catch (error) {
        await db.run("ROLLBACK");
        res.status(500).json({ error: "Error al registrar el pago" });
    }
});
// REABRIR UNA LIQUIDACIÓN YA CERRADA (revierte el movimiento de stock)
app.put("/api/remitos/:id/reabrir", async (req, res) => {
    const remitoId = req.params.id;
    try {
        const cab = await db.get(`SELECT id, estado FROM Remitos WHERE id = ?`, [
            remitoId,
        ]);
        if (!cab)
            return res.status(404).json({ error: "Remito no encontrado." });
        if (cab.estado !== "Cerrado")
            return res.status(400).json({ error: "El remito no está cerrado." });
        await db.run("BEGIN TRANSACTION");
        const items = await db.all(`SELECT producto_id, cantidad_devuelta, cantidad_vendida
       FROM Remitos_Items WHERE remito_id = ?`, [remitoId]);
        for (const it of items) {
            // Exactamente al revés de lo que hizo el cierre
            await db.run(`UPDATE Productos SET stock_disponible = stock_disponible - ?, stock_real = stock_real + ? WHERE id = ?`, [it.cantidad_devuelta, it.cantidad_vendida, it.producto_id]);
            await db.run(`UPDATE Remitos_Items SET cantidad_devuelta = 0, cantidad_vendida = 0 WHERE remito_id = ? AND producto_id = ?`, [remitoId, it.producto_id]);
        }
        // Los pagos NO se borran: quedan en la tabla Pagos y se recuperan al volver a cerrar
        await db.run(`UPDATE Remitos SET estado='Pendiente', comision=0, total_rendir=0 WHERE id=?`, [remitoId]);
        await db.run("COMMIT");
        res.json({ mensaje: "Remito reabierto correctamente." });
    }
    catch (error) {
        await db.run("ROLLBACK");
        res
            .status(500)
            .json({ error: error.message || "Error al reabrir el remito." });
    }
});
// OBTENER HISTORIAL DE PAGOS DE UN REMITO
app.get("/api/remitos/:id/pagos", async (req, res) => {
    try {
        const pagos = await db.all(`SELECT * FROM Pagos WHERE remito_id = ? ORDER BY fecha DESC`, [req.params.id]);
        res.json(pagos);
    }
    catch (error) {
        res.status(500).json({ error: "Error al obtener los pagos" });
    }
});
app.put("/api/remitos/:id", async (req, res) => {
    const remitoId = req.params.id;
    const { vendedor_id, items } = req.body;
    if (!items || items.length === 0)
        return res.status(400).json({ error: "El remito no puede estar vacío." });
    try {
        await db.run("BEGIN TRANSACTION");
        if (vendedor_id) {
            await db.run(`UPDATE Remitos SET vendedor_id=? WHERE id=?`, [
                vendedor_id,
                remitoId,
            ]);
        }
        const itemsViejos = await db.all(`SELECT producto_id, cantidad_entregada FROM Remitos_Items WHERE remito_id=?`, [remitoId]);
        for (const viejo of itemsViejos) {
            await db.run(`UPDATE Productos SET stock_disponible = stock_disponible + ? WHERE id=?`, [viejo.cantidad_entregada, viejo.producto_id]);
        }
        await db.run(`DELETE FROM Remitos_Items WHERE remito_id=?`, [remitoId]);
        for (const item of items) {
            await db.run(`INSERT INTO Remitos_Items (remito_id, producto_id, cantidad_entregada, precio) VALUES (?, ?, ?, ?)`, [remitoId, item.producto_id, item.cantidad, item.precio]);
            await db.run(`UPDATE Productos SET stock_disponible = stock_disponible - ? WHERE id=?`, [item.cantidad, item.producto_id]);
        }
        await db.run("COMMIT");
        res.json({ mensaje: "Remito editado y stock recalculado correctamente" });
    }
    catch (error) {
        await db.run("ROLLBACK");
        res.status(500).json({ error: "Error al editar el remito" });
    }
});
// RUTA ESPÍA PARA VER LA BASE DE DATOS DIRECTO
app.get("/api/debug", async (req, res) => {
    try {
        const datos = await db.all("SELECT * FROM Remitos_Items");
        res.json(datos);
    }
    catch (e) {
        res.json({ error: "error" });
    }
});
// ============================================================
// STATIC FILES Y FALLBACK ANGULAR
// ============================================================
app.use(express_1.default.static(path_1.default.join(__dirname, "..", "public", "frontend", "browser")));
app.get(/.*/, (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "public", "frontend", "browser", "index.html"));
});
app.listen(PORT, "127.0.0.1", () => {
    console.log(`🚀 Servidor corriendo en http://127.0.0.1:${PORT}`);
});
