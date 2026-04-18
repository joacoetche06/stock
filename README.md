# Stock Template — Sistema de Stock con Remitos y Consignación

App de escritorio (Electron + Angular + Express + SQLite) lista para adaptar a cualquier comercio que maneje stock, vendedores/revendedores y remitos de consignación.

---

## 🚀 Setup para un nuevo cliente

### 1. Cloná el repo
```bash
git clone https://github.com/joacoetche06/stock-template.git mi-cliente
cd mi-cliente
```

### 2. Configurá el negocio
Editá **`backend/config.json`** con los datos del cliente:

```json
{
  "negocio": {
    "nombre": "Nombre Completo del Negocio",
    "nombreCorto": "NOMBRE CORTO",
    "slogan": "Descripción breve",
    "colorPrincipal": "#b87366",
    "colorSecundario": "#f4d1d1",
    "colorAcento": "#b5d8cc"
  },
  "app": {
    "puerto": 3001,
    "nombreBD": "mi-cliente.sqlite",
    "comisionDefault": 20
  },
  "inventario": {
    "nombreProducto": "producto",
    "nombreProductoPlural": "productos",
    "nombreVendedor": "vendedor",
    "nombreVendedorPlural": "vendedores",
    "usaMedida": false,
    "categoriaConMedida": "",
    "medidas": [],
    "categorias": [
      { "nombre": "Categoría A", "prefijo": "CA" },
      { "nombre": "Categoría B", "prefijo": "CB" }
    ],
    "materiales": ["Material 1", "Material 2"]
  }
}
```

> 💡 Ver `backend/config.ejemplo-joyeria.json` como referencia de una instalación real.

### 3. Reemplazá el logo
Copiá el logo del cliente en:
- `frontend/public/logo.png` (navbar)
- `frontend/public/logo.ico` (ícono de la app)
- `backend/public/frontend/browser/logo.png` (para el remito impreso en producción)

### 4. Buildear y empaquetar
```bash
# Frontend
cd frontend
npm install
npm run build
# Copiar dist a backend/public/frontend/

# Backend
cd ../backend
npm install
npm run build

# Empaquetar como .exe
npm run empaquetar
```

---

## 📂 Estructura del proyecto

```
├── backend/
│   ├── config.json              ← ⭐ CONFIGURACIÓN DEL CLIENTE
│   ├── config.ejemplo-joyeria.json
│   ├── src/server.ts
│   └── ...
└── frontend/
    └── src/app/
        ├── services/
        │   └── config.service.ts  ← Lee config al arrancar
        ├── pages/
        │   ├── productos/
        │   ├── vendedores/
        │   └── remitos/
        └── app.config.ts          ← APP_INITIALIZER carga config
```

---

## ⚙️ Cómo funciona la templateización

1. El backend expone `GET /api/config` que devuelve el `config.json` completo.
2. `APP_INITIALIZER` en Angular llama a ese endpoint **antes** de que arranque la app.
3. `ConfigService` guarda la config como signal global y aplica los colores CSS automáticamente.
4. Todos los componentes leen categorías, materiales, nombres y colores desde `ConfigService`, sin ningún hardcoding.

---

## 🎨 Paleta de colores — referencia rápida

| Variable CSS          | Uso                        |
|-----------------------|----------------------------|
| `--color-principal`   | Botones, bordes, acentos   |
| `--color-secundario`  | Fondos suaves, hover       |
| `--color-acento`      | Detalles secundarios       |

Los tres se setean automáticamente desde `config.json` al iniciar.

---

## 📋 Ramas del repo

| Rama           | Descripción                              |
|----------------|------------------------------------------|
| `main`         | Plantilla genérica (este código)         |
| `adri`         | Instalación de Chicas de Buenos Aires    |

Cada cliente nuevo debería tener su propia rama: `git checkout -b cliente-nombre`.
