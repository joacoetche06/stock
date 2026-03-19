import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const app = express();
const PORT = 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Variable global para la base de datos
let db: any;

// Inicializar la Base de Datos SQLite
// Inicializar la Base de Datos SQLite
async function inicializarDB() {
  try {
    db = await open({
      filename: "./app-adri.sqlite",
      driver: sqlite3.Database,
    });

    console.log("✅ Base de datos SQLite conectada.");

    // Crear las tablas si no existen
    await db.exec(`
            CREATE TABLE IF NOT EXISTS Productos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo TEXT UNIQUE,
                categoria TEXT,  -- Ej: Pulseras, Collares, Anillos
                material TEXT,   -- Ej: Acero, Plata, Cristal
                nombre TEXT NOT NULL,
                precio REAL DEFAULT 0,
                stock_real INTEGER DEFAULT 0,
                stock_disponible INTEGER DEFAULT 0
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
        `);

    console.log("📦 Tablas sincronizadas correctamente.");
  } catch (error) {
    console.error("❌ Error al conectar con la base de datos:", error);
  }
}
inicializarDB();

// Ruta de prueba
app.get("/api/status", (req, res) => {
  res.json({ mensaje: "¡Servidor de App Adri funcionando a la perfección!" });
});

// --- RUTAS DE PRODUCTOS ---

// 1. Obtener todos los productos
app.get("/api/productos", async (req, res) => {
  try {
    // db.all() ejecuta la query y devuelve un array con todos los resultados
    const productos = await db.all("SELECT * FROM Productos");
    res.json(productos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener los productos" });
  }
});

// 2. Crear un nuevo producto
app.post("/api/productos", async (req, res) => {
  const {
    codigo,
    categoria,
    material,
    nombre,
    precio,
    stock_real,
    stock_disponible,
  } = req.body;

  try {
    const result = await db.run(
      `INSERT INTO Productos (codigo, categoria, material, nombre, precio, stock_real, stock_disponible) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        codigo,
        categoria || "",
        material || "",
        nombre,
        precio || 0,
        stock_real || 0,
        stock_disponible || 0,
      ],
    );

    res
      .status(201)
      .json({ mensaje: "Producto creado exitosamente", id: result.lastID });
  } catch (error: any) {
    console.error(error);
    if (error.code === "SQLITE_CONSTRAINT") {
      res.status(400).json({ error: "Ya existe un producto con ese código." });
    } else {
      res.status(500).json({ error: "Error interno al crear el producto" });
    }
  }
});

// 3. Modificar un producto existente (Ej: Editar Precio)
app.put("/api/productos/:id", async (req, res) => {
  const { codigo, categoria, material, nombre, precio } = req.body;
  const productoId = req.params.id;

  try {
    // Nota: No actualizamos el stock acá para no romper la contabilidad. El stock se mueve con los remitos.
    await db.run(
      `UPDATE Productos 
             SET codigo = ?, categoria = ?, material = ?, nombre = ?, precio = ? 
             WHERE id = ?`,
      [codigo, categoria, material, nombre, precio, productoId],
    );

    res.json({ mensaje: "Producto actualizado correctamente" });
  } catch (error: any) {
    console.error(error);
    if (error.code === "SQLITE_CONSTRAINT") {
      res
        .status(400)
        .json({ error: "El código ingresado ya pertenece a otra joya." });
    } else {
      res.status(500).json({ error: "Error al actualizar el producto" });
    }
  }
});

// --- RUTAS DE VENDEDORES ---

// 1. Obtener todos los vendedores
app.get("/api/vendedores", async (req, res) => {
  try {
    const vendedores = await db.all("SELECT * FROM Vendedores");
    res.json(vendedores);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener los vendedores" });
  }
});

// 2. Crear un nuevo vendedor
app.post("/api/vendedores", async (req, res) => {
  const { nombre, telefono } = req.body;

  // Validación básica: no queremos vendedores sin nombre
  if (!nombre) {
    return res
      .status(400)
      .json({ error: "El nombre del vendedor es obligatorio" });
  }

  try {
    const result = await db.run(
      `INSERT INTO Vendedores (nombre, telefono) VALUES (?, ?)`,
      [nombre, telefono || ""],
    );

    res.status(201).json({
      mensaje: "Vendedor creado exitosamente",
      id: result.lastID,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno al crear el vendedor" });
  }
});

// Modificar un vendedor existente (Ej: Editar nombre o teléfono)
app.put("/api/vendedores/:id", async (req, res) => {
  const { nombre, telefono } = req.body;
  const vendedorId = req.params.id;

  try {
    await db.run(
      `UPDATE Vendedores SET nombre = ?, telefono = ? WHERE id = ?`,
      [nombre, telefono, vendedorId],
    );
    res.json({ mensaje: "Vendedor actualizado correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al actualizar el vendedor" });
  }
});

// --- RUTAS DE REMITOS ---

// Crear un nuevo remito (Entrega de mercadería)
app.post("/api/remitos", async (req, res) => {
  const { vendedor_id, items } = req.body;
  // Esperamos que "items" sea un array así: [{ producto_id: 1, cantidad: 5 }, ...]

  if (!vendedor_id || !items || items.length === 0) {
    return res
      .status(400)
      .json({ error: "Faltan datos para crear el remito." });
  }

  try {
    // Iniciamos la transacción
    await db.run("BEGIN TRANSACTION");

    // 1. Crear la cabecera del remito (la fecha la pone SQLite sola con date('now'))
    const resultRemito = await db.run(
      `INSERT INTO Remitos (vendedor_id, fecha_salida) VALUES (?, date('now'))`,
      [vendedor_id],
    );
    const remitoId = resultRemito.lastID;

    // 2. Procesar cada producto que se lleva el vendedor
    for (const item of items) {
      // Insertar el detalle del remito
      await db.run(
        `INSERT INTO Remitos_Items (remito_id, producto_id, cantidad_entregada) 
                 VALUES (?, ?, ?)`,
        [remitoId, item.producto_id, item.cantidad],
      );

      // Descontar SOLO el stock_disponible
      await db.run(
        `UPDATE Productos 
                 SET stock_disponible = stock_disponible - ? 
                 WHERE id = ?`,
        [item.cantidad, item.producto_id],
      );
    }

    // Si todo salió bien, confirmamos los cambios en la base de datos
    await db.run("COMMIT");

    res.status(201).json({
      mensaje: "Remito generado con éxito",
      remito_id: remitoId,
    });
  } catch (error) {
    // Si algo falló, deshacemos todo para no romper el stock
    await db.run("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "Error interno al generar el remito" });
  }
});

// Obtener todos los remitos (con un JOIN para ver el nombre del vendedor)
app.get("/api/remitos", async (req, res) => {
  try {
    const remitos = await db.all(`
            SELECT r.id, r.fecha_salida, r.estado, v.nombre as vendedor 
            FROM Remitos r
            JOIN Vendedores v ON r.vendedor_id = v.id
        `);
    res.json(remitos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener los remitos" });
  }
});

// Obtener los items de un remito específico (ACTUALIZADO PARA IMPRESIÓN)
app.get("/api/remitos/:id/items", async (req, res) => {
  try {
    const items = await db.all(
      `
            SELECT ri.producto_id, ri.cantidad_entregada, ri.cantidad_vendida, ri.cantidad_devuelta, 
                   p.nombre, p.codigo, p.categoria, p.material, p.precio 
            FROM Remitos_Items ri
            JOIN Productos p ON ri.producto_id = p.id
            WHERE ri.remito_id = ?
        `,
      [req.params.id],
    );
    res.json(items);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener los items del remito" });
  }
});

// Cerrar un remito (Regreso de mercadería)
app.put("/api/remitos/:id/cerrar", async (req, res) => {
  const remitoId = req.params.id;
  const { items } = req.body;
  // items: [{ producto_id: 1, cantidad_devuelta: 2, cantidad_vendida: 1 }]

  try {
    await db.run("BEGIN TRANSACTION");

    // 1. Marcar el remito como Cerrado
    await db.run(`UPDATE Remitos SET estado = 'Cerrado' WHERE id = ?`, [
      remitoId,
    ]);

    // 2. Procesar cada producto que vuelve
    for (const item of items) {
      // Actualizar el detalle del remito
      await db.run(
        `UPDATE Remitos_Items 
                 SET cantidad_devuelta = ?, cantidad_vendida = ?
                 WHERE remito_id = ? AND producto_id = ?`,
        [
          item.cantidad_devuelta,
          item.cantidad_vendida,
          remitoId,
          item.producto_id,
        ],
      );

      // Actualizar el stock del producto:
      // - Lo devuelto vuelve al stock disponible.
      // - Lo vendido se resta del stock real (ya no es nuestro).
      await db.run(
        `UPDATE Productos 
                 SET stock_disponible = stock_disponible + ?,
                     stock_real = stock_real - ?
                 WHERE id = ?`,
        [item.cantidad_devuelta, item.cantidad_vendida, item.producto_id],
      );
    }

    await db.run("COMMIT");
    res.json({ mensaje: "Remito cerrado y stock actualizado correctamente" });
  } catch (error) {
    await db.run("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "Error al cerrar el remito" });
  }
});

// --- RUTAS PARA ELIMINAR ---

// Eliminar Producto
app.delete("/api/productos/:id", async (req, res) => {
  try {
    await db.run(`DELETE FROM Productos WHERE id = ?`, [req.params.id]);
    res.json({ mensaje: "Producto eliminado correctamente" });
  } catch (error: any) {
    console.error(error);
    res
      .status(500)
      .json({
        error: "No se puede eliminar. Probablemente ya esté en un remito.",
      });
  }
});

// Eliminar Vendedor
app.delete("/api/vendedores/:id", async (req, res) => {
  try {
    await db.run(`DELETE FROM Vendedores WHERE id = ?`, [req.params.id]);
    res.json({ mensaje: "Vendedor eliminado correctamente" });
  } catch (error: any) {
    console.error(error);
    res
      .status(500)
      .json({ error: "No se puede eliminar. Probablemente ya tenga remitos." });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
