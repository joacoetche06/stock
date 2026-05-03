import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import fs from "fs";

interface Product {
  id: number;
  codigo: string;
  categoria: string;
  material: string;
  medida: string;
  nombre: string;
  precio: number;
  stock_real: number;
  stock_disponible: number;
}

const app = express();

// ============================================================
// CARGA DE CONFIGURACIÓN CENTRAL
// ============================================================
const rutaConfig = path.join(__dirname, "..", "config.json");
let CONFIG: any = {};

try {
  const raw = fs.readFileSync(rutaConfig, "utf-8");
  CONFIG = JSON.parse(raw);
  console.log(`✅ Config cargada: ${CONFIG.negocio?.nombre}`);
} catch (e) {
  console.error(
    "❌ No se pudo leer config.json. Asegurate de que exista en la raíz del backend.",
  );
  process.exit(1);
}

const PORT = CONFIG.app?.puerto || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Variable global para la base de datos
let db: any;

const rutaSegura = process.env.USER_DATA_PATH || path.join(__dirname, "..");
const dbPath = path.join(
  rutaSegura,
  CONFIG.app?.nombreBD || "stock-app.sqlite",
);

// ============================================================
// INICIALIZACIÓN DE BASE DE DATOS
// ============================================================
async function inicializarDB() {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
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
      } catch (_) {}
    }

    console.log("📦 Tablas sincronizadas correctamente.");
  } catch (error) {
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
    fs.writeFileSync(rutaConfig, JSON.stringify(nuevaConfig, null, 2), "utf-8");
    // Actualizamos la variable en memoria del servidor
    CONFIG = nuevaConfig; 
    res.json({ mensaje: "Configuración actualizada correctamente" });
  } catch (error) {
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
    const productos: Product[] = await db.all("SELECT * FROM Productos");
    
    // Buscamos quién tiene qué cosa en remitos pendientes
    const distribuciones = await db.all(`
      SELECT ri.producto_id, (ri.cantidad_entregada - ri.cantidad_vendida - ri.cantidad_devuelta) as cantidad, v.nombre as vendedor
      FROM Remitos_Items ri
      JOIN Remitos r ON ri.remito_id = r.id
      JOIN Vendedores v ON r.vendedor_id = v.id
      WHERE r.estado = 'Pendiente' AND (ri.cantidad_entregada - ri.cantidad_vendida - ri.cantidad_devuelta) > 0
    `);

    // Lo agrupamos por producto
    const distMap: any = {};
    for(const d of distribuciones) {
      if(!distMap[d.producto_id]) distMap[d.producto_id] = [];
      distMap[d.producto_id].push({ vendedor: d.vendedor, cantidad: d.cantidad });
    }

    // Se lo metemos al producto final
    const response = productos.map(p => ({
      ...p,
      distribucion: distMap[p.id] || []
    }));

    res.json(response);
  } catch (error) {
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
  const cats: { nombre: string; prefijo: string }[] =
    CONFIG.inventario?.categorias || [];
  const catConfig = cats.find((c) => c.nombre === categoria);
  const prefijo = catConfig?.prefijo || "OT";

  try {
    const row = await db.get(
      `SELECT codigo FROM Productos WHERE codigo LIKE ? ORDER BY CAST(SUBSTR(codigo, ${prefijo.length + 1}) AS INTEGER) DESC LIMIT 1`,
      [`${prefijo}%`],
    );

    let nuevoNumero = 1;
    if (row?.codigo) {
      const n = parseInt(row.codigo.substring(prefijo.length));
      if (!isNaN(n)) nuevoNumero = n + 1;
    }

    const codigoGenerado = `${prefijo}${nuevoNumero.toString().padStart(2, "0")}`;

    const result = await db.run(
      `INSERT INTO Productos (codigo, categoria, material, medida, nombre, precio, stock_real, stock_disponible)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        codigoGenerado,
        categoria,
        material,
        medida,
        nombre,
        precio,
        stock_real,
        stock_real,
      ],
    );

    res.json({
      id: result.lastID,
      codigo: codigoGenerado,
      mensaje: "Producto creado",
    });
  } catch (error) {
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

  const cats: { nombre: string; prefijo: string }[] =
    CONFIG.inventario?.categorias || [];

  try {
    await db.run("BEGIN TRANSACTION");
    let creados = 0;

    for (const prod of productos) {
      const categoria = prod.categoria || "";
      const catConfig = cats.find((c) => c.nombre === categoria);
      const prefijo = catConfig?.prefijo || "OT";

      const row = await db.get(
        `SELECT codigo FROM Productos WHERE codigo LIKE ? ORDER BY CAST(SUBSTR(codigo, ${prefijo.length + 1}) AS INTEGER) DESC LIMIT 1`,
        [`${prefijo}%`],
      );

      let nuevoNumero = 1;
      if (row?.codigo) {
        const n = parseInt(row.codigo.substring(prefijo.length));
        if (!isNaN(n)) nuevoNumero = n + 1;
      }

      const codigoGenerado = `${prefijo}${nuevoNumero.toString().padStart(2, "0")}`;
      const stock = Number(prod.stock) || 0;

      await db.run(
        `INSERT INTO Productos (codigo, categoria, material, medida, nombre, precio, stock_real, stock_disponible)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          codigoGenerado,
          categoria,
          prod.material || "",
          prod.medida || "",
          prod.nombre || "",
          Number(prod.precio) || 0,
          stock,
          stock,
        ],
      );
      creados++;
    }

    await db.run("COMMIT");
    res.json({
      mensaje: `Se importaron ${creados} productos exitosamente al inventario.`,
    });
  } catch (error) {
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
    await db.run(
      `UPDATE Productos SET precio = ROUND(precio * ?, 2) WHERE id IN (${placeholders})`,
      [multiplicador, ...ids],
    );
    res.json({ mensaje: "Precios actualizados correctamente" });
  } catch (error) {
    res.status(500).json({ error: "Error al aplicar el aumento masivo" });
  }
});

app.put("/api/productos/:id", async (req, res) => {
  const { codigo, categoria, material, medida, nombre, precio, stock_real } =
    req.body;
  const productoId = req.params.id;

  try {
    const productoViejo = await db.get(
      `SELECT stock_real, stock_disponible FROM Productos WHERE id = ?`,
      [productoId],
    );
    if (!productoViejo)
      return res.status(404).json({ error: "Producto no encontrado" });

    const diferencia = stock_real - productoViejo.stock_real;
    const nuevoStockDisponible = productoViejo.stock_disponible + diferencia;

    if (nuevoStockDisponible < 0) {
      return res.status(400).json({
        error:
          "No podés reducir tanto el stock. Hay unidades de este producto en remitos activos.",
      });
    }

    await db.run(
      `UPDATE Productos SET codigo=?, categoria=?, material=?, medida=?, nombre=?, precio=?, stock_real=?, stock_disponible=? WHERE id=?`,
      [
        codigo,
        categoria,
        material,
        medida,
        nombre,
        precio,
        stock_real,
        nuevoStockDisponible,
        productoId,
      ],
    );
    res.json({ mensaje: "Producto actualizado correctamente" });
  } catch (error: any) {
    if (error.code === "SQLITE_CONSTRAINT") {
      res
        .status(400)
        .json({ error: "El código ingresado ya pertenece a otro producto." });
    } else {
      res.status(500).json({ error: "Error al actualizar el producto" });
    }
  }
});

app.delete("/api/productos/:id", async (req, res) => {
  try {
    await db.run(`DELETE FROM Productos WHERE id = ?`, [req.params.id]);
    res.json({ mensaje: "Producto eliminado correctamente" });
  } catch (error: any) {
    res
      .status(500)
      .json({
        error:
          "No se puede eliminar. El producto ya está incluido en un remito.",
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
  } catch (error) {
    res.status(500).json({ error: "Error al obtener los vendedores" });
  }
});

app.post("/api/vendedores", async (req, res) => {
  const { nombre, telefono } = req.body;
  if (!nombre)
    return res.status(400).json({ error: "El nombre es obligatorio" });
  try {
    const result = await db.run(
      `INSERT INTO Vendedores (nombre, telefono) VALUES (?, ?)`,
      [nombre, telefono || ""],
    );
    res
      .status(201)
      .json({ mensaje: "Vendedor creado exitosamente", id: result.lastID });
  } catch (error) {
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
  } catch (error) {
    res.status(500).json({ error: "Error al actualizar el vendedor" });
  }
});

app.delete("/api/vendedores/:id", async (req, res) => {
  try {
    await db.run(`DELETE FROM Vendedores WHERE id = ?`, [req.params.id]);
    res.json({ mensaje: "Vendedor eliminado correctamente" });
  } catch (error: any) {
    res
      .status(500)
      .json({
        error: "No se puede eliminar. El vendedor ya tiene remitos asociados.",
      });
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
    const resultRemito = await db.run(
      `INSERT INTO Remitos (vendedor_id, fecha_salida) VALUES (?, date('now'))`,
      [vendedor_id],
    );
    const remitoId = resultRemito.lastID;
    for (const item of items) {
      await db.run(
        `INSERT INTO Remitos_Items (remito_id, producto_id, cantidad_entregada, precio) VALUES (?, ?, ?, ?)`,
        [remitoId, item.producto_id, item.cantidad, item.precio],
      );
      await db.run(
        `UPDATE Productos SET stock_disponible = stock_disponible - ? WHERE id = ?`,
        [item.cantidad, item.producto_id],
      );
    }
    await db.run("COMMIT");
    res
      .status(201)
      .json({ mensaje: "Remito generado con éxito", remito_id: remitoId });
  } catch (error) {
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
  } catch (error) {
    res.status(500).json({ error: "Error al obtener los remitos" });
  }
});
app.get("/api/remitos/:id/items", async (req, res) => {
  try {
   const items = await db.all(
      `SELECT ri.producto_id, ri.cantidad_entregada, ri.cantidad_vendida, ri.cantidad_devuelta, 
              CASE WHEN ri.precio > 0 THEN ri.precio ELSE p.precio END as precio,
              p.nombre, p.codigo, p.categoria, p.material
       FROM Remitos_Items ri
       JOIN Productos p ON ri.producto_id = p.id
       WHERE ri.remito_id = ?`,
      [req.params.id],
    );
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener los items del remito" });
  }
});

app.put("/api/remitos/:id/cerrar", async (req, res) => {
  const remitoId = req.params.id;
  const { items, comision, total_rendir } = req.body; // <-- AHORA RECIBE EL TOTAL
  try {
    await db.run("BEGIN TRANSACTION");
    
    // Guardamos el total_rendir y reseteamos el abonado a 0
    await db.run(`UPDATE Remitos SET estado='Cerrado', comision=?, total_rendir=?, abonado=0 WHERE id=?`, [
      comision || 0,
      total_rendir || 0,
      remitoId,
    ]);
    
    for (const item of items) {
      await db.run(
        `UPDATE Remitos_Items SET cantidad_devuelta=?, cantidad_vendida=? WHERE remito_id=? AND producto_id=?`,
        [
          item.cantidad_devuelta,
          item.cantidad_vendida,
          remitoId,
          item.producto_id,
        ],
      );
      await db.run(
        `UPDATE Productos SET stock_disponible = stock_disponible + ?, stock_real = stock_real - ? WHERE id = ?`,
        [item.cantidad_devuelta, item.cantidad_vendida, item.producto_id],
      );
    }
    await db.run("COMMIT");
    res.json({ mensaje: "Remito cerrado y stock actualizado correctamente" });
  } catch (error) {
    await db.run("ROLLBACK");
    res.status(500).json({ error: "Error al cerrar el remito" });
  }
});

// REGISTRAR PAGO PARCIAL A UN REMITO CERRADO
app.put("/api/remitos/:id/pagar", async (req, res) => {
  const remitoId = req.params.id;
  const { monto } = req.body;
  
  if (!monto || monto <= 0) return res.status(400).json({ error: "Monto inválido" });

  try {
    await db.run("BEGIN TRANSACTION");
    // 1. Sumamos al total abonado
    await db.run(`UPDATE Remitos SET abonado = abonado + ? WHERE id=?`, [monto, remitoId]);
    // 2. Guardamos el registro histórico del pago con fecha y hora
    await db.run(`INSERT INTO Pagos (remito_id, monto, fecha) VALUES (?, ?, ?)`, [remitoId, monto, new Date().toISOString()]);
    await db.run("COMMIT");

    res.json({ mensaje: "Pago registrado y guardado en el historial" });
  } catch (error) {
    await db.run("ROLLBACK");
    res.status(500).json({ error: "Error al registrar el pago" });
  }
});

// OBTENER HISTORIAL DE PAGOS DE UN REMITO
app.get("/api/remitos/:id/pagos", async (req, res) => {
  try {
    const pagos = await db.all(`SELECT * FROM Pagos WHERE remito_id = ? ORDER BY fecha DESC`, [req.params.id]);
    res.json(pagos);
  } catch (error) {
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
    const itemsViejos = await db.all(
      `SELECT producto_id, cantidad_entregada FROM Remitos_Items WHERE remito_id=?`,
      [remitoId],
    );
    for (const viejo of itemsViejos) {
      await db.run(
        `UPDATE Productos SET stock_disponible = stock_disponible + ? WHERE id=?`,
        [viejo.cantidad_entregada, viejo.producto_id],
      );
    }
    await db.run(`DELETE FROM Remitos_Items WHERE remito_id=?`, [remitoId]);
    for (const item of items) {
      await db.run(
        `INSERT INTO Remitos_Items (remito_id, producto_id, cantidad_entregada, precio) VALUES (?, ?, ?, ?)`,
        [remitoId, item.producto_id, item.cantidad, item.precio],
      );
      await db.run(
        `UPDATE Productos SET stock_disponible = stock_disponible - ? WHERE id=?`,
        [item.cantidad, item.producto_id],
      );
    }
    await db.run("COMMIT");
    res.json({ mensaje: "Remito editado y stock recalculado correctamente" });
  } catch (error) {
    await db.run("ROLLBACK");
    res.status(500).json({ error: "Error al editar el remito" });
  }
});

// RUTA ESPÍA PARA VER LA BASE DE DATOS DIRECTO
app.get("/api/debug", async (req, res) => {
  try {
    const datos = await db.all("SELECT * FROM Remitos_Items");
    res.json(datos);
  } catch (e) {
    res.json({ error: "error" });
  }
});

// ============================================================
// STATIC FILES Y FALLBACK ANGULAR
// ============================================================
app.use(
  express.static(path.join(__dirname, "..", "public", "frontend", "browser")),
);

app.get(/.*/, (req, res) => {
  res.sendFile(
    path.join(__dirname, "..", "public", "frontend", "browser", "index.html"),
  );
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`🚀 Servidor corriendo en http://127.0.0.1:${PORT}`);
});
