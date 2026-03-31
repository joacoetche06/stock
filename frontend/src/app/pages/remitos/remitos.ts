import { Component, signal, afterNextRender, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RemitoService } from '../../services/remito.service';
import { VendedorService, Vendedor } from '../../services/vendedor.service';
import { ProductoService, Producto } from '../../services/producto.service';

@Component({
  selector: 'app-remitos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './remitos.html',
  styleUrl: './remitos.css',
})
export class RemitosComponent {
  remitosHistorial = signal<any[]>([]);

  // --- NUEVO: Filtro de Remitos por Vendedora ---
  filtroVendedor = signal<string>('');

  remitosFiltrados = computed(() => {
    const vendedora = this.filtroVendedor();
    // Si no eligió ninguna vendedora en el filtro, mostramos todos los remitos
    if (!vendedora) return this.remitosHistorial();

    // Si eligió una, filtramos la lista comparando el nombre
    return this.remitosHistorial().filter((r) => r.vendedor === vendedora);
  });
  vendedores = signal<Vendedor[]>([]);
  productos = signal<Producto[]>([]);

  vendedorSeleccionado = signal<number | string>('');
  productoSeleccionado = signal<number | string>('');
  cantidadSeleccionada = signal<number>(1);
  itemsCarrito = signal<any[]>([]);

  // --- NUEVO: Buscador Inteligente Visual ---
  terminoBusqueda = signal<string>('');
  mostrarDropdown = signal<boolean>(false); // Controla si se ve la listita flotante

  // Esta función se llama cada vez que escribe una letra
  buscarJoya(termino: string) {
    this.terminoBusqueda.set(termino);
    this.productoSeleccionado.set(''); // Deseleccionamos si vuelve a escribir
    this.mostrarDropdown.set(true);
  }

  // Esta función se llama cuando hace clic en una opción de la lista flotante
  seleccionarProducto(p: any) {
    this.productoSeleccionado.set(p.id);
    this.terminoBusqueda.set(`${p.codigo} - ${p.nombre}`); // Escribe el nombre en el input
    this.mostrarDropdown.set(false); // Oculta la lista
  }

  // Se llama cuando hace clic afuera del input
  ocultarDropdown() {
    // Le damos un micro-segundo de delay para que le dé tiempo al navegador de registrar el clic en la lista
    setTimeout(() => this.mostrarDropdown.set(false), 200);
  }

  // Magia de Angular: Filtra la lista en tiempo real
  productosDisponibles = computed(() => {
    const busqueda = this.terminoBusqueda().toLowerCase();
    const enCarritoIds = this.itemsCarrito().map((item) => item.producto_id);

    return this.productos().filter((p) => {
      // 1. Ocultar si ya está en el carrito
      if (enCarritoIds.includes(p.id!)) return false;
      // 2. Ocultar si no hay stock
      if (p.stock_disponible <= 0) return false;
      // 3. Filtrar por búsqueda (código, nombre, categoría o material)
      if (!busqueda) return true; // Si no buscó nada, muestra todos

      return (
        (p.codigo?.toLowerCase() || '').includes(busqueda) ||
        (p.nombre?.toLowerCase() || '').includes(busqueda) ||
        (p.categoria?.toLowerCase() || '').includes(busqueda) ||
        (p.material?.toLowerCase() || '').includes(busqueda)
      );
    });
  });

  // --- VARIABLES PARA EL CIERRE DE REMITO ---
  remitoEnCierre = signal<any>(null);
  itemsEnCierre = signal<any[]>([]);

  constructor(
    private remitoService: RemitoService,
    private vendedorService: VendedorService,
    private productoService: ProductoService,
  ) {
    afterNextRender(() => {
      this.cargarDatosBase();
      this.cargarHistorialRemitos();
    });
  }

  cargarDatosBase() {
    this.vendedorService.getVendedores().subscribe((v) => this.vendedores.set(v));
    this.productoService.getProductos().subscribe((p) => this.productos.set(p));
  }

  cargarHistorialRemitos() {
    this.remitoService.getRemitos().subscribe((r) => this.remitosHistorial.set(r));
  }

  agregarAlRemito() {
    const prodId = Number(this.productoSeleccionado());
    const cant = this.cantidadSeleccionada();

    if (!prodId || cant <= 0) return alert('Seleccioná un producto y cantidad válida.');
    const producto = this.productos().find((p) => p.id === prodId);
    if (!producto) return;

    if (cant > producto.stock_disponible) {
      return alert(`Solo tenés ${producto.stock_disponible} disponibles de esta joya.`);
    }

    const itemsActuales = this.itemsCarrito();
    this.itemsCarrito.set([
      ...itemsActuales,
      {
        producto_id: producto.id,
        codigo: producto.codigo, // Agregado para mostrarlo en el carrito
        nombre: producto.nombre,
        cantidad: cant,
        stock_maximo: producto.stock_disponible, // Guardamos el tope para la validación visual
      },
    ]);

    // Limpiar campos después de agregar
    this.productoSeleccionado.set('');
    this.cantidadSeleccionada.set(1);
    this.terminoBusqueda.set(''); // Limpiamos el buscador para la próxima joya
  }

  quitarDelRemito(index: number) {
    const itemsActuales = this.itemsCarrito();
    itemsActuales.splice(index, 1);
    this.itemsCarrito.set([...itemsActuales]);
  }

  guardarRemitoFinal() {
    const vendId = Number(this.vendedorSeleccionado());
    const items = this.itemsCarrito();

    if (!vendId) return alert('Seleccioná un vendedor.');
    if (items.length === 0) return alert('El remito está vacío.');

    for (const item of items) {
      if (item.cantidad < 1 || item.cantidad > item.stock_maximo) {
        return alert(
          `Revisá la cantidad de: ${item.codigo}. Debe ser entre 1 y ${item.stock_maximo}.`,
        );
      }
    }

    const payload = {
      vendedor_id: vendId,
      items: items.map((item) => ({ producto_id: item.producto_id, cantidad: item.cantidad })),
    };

    this.remitoService.crearRemito(payload).subscribe({
      next: () => {
        alert('✅ Remito generado con éxito.');

        // 1. Limpiamos la vista superior
        this.vendedorSeleccionado.set('');
        this.itemsCarrito.set([]);

        // 2. Cerramos cualquier panel que haya quedado abierto abajo
        this.cancelarCierre();
        this.cerrarDetalle();

        // 3. Forzamos a Angular a redibujar la tabla y pedimos datos nuevos
        this.remitosHistorial.set([]);
        this.cargarHistorialRemitos();
        this.cargarDatosBase();
      },
      error: () => alert('Error al guardar el remito.'),
    });
  }

  // --- FUNCIONES PARA CERRAR REMITO (Sin cambios) ---
  abrirPanelCierre(remito: any) {
    this.remitoEnCierre.set(remito);
    this.remitoService.getRemitoItems(remito.id).subscribe({
      next: (items) => {
        const itemsPreparados = items.map((i) => ({
          ...i,
          cantidad_vendida: 0,
          cantidad_devuelta: 0,
        }));
        this.itemsEnCierre.set(itemsPreparados);
      },
      error: () => alert('Error al cargar los items del remito.'),
    });
  }

  cancelarCierre() {
    this.remitoEnCierre.set(null);
    this.itemsEnCierre.set([]);
  }

  confirmarCierre() {
    const items = this.itemsEnCierre();
    for (let item of items) {
      const total = item.cantidad_vendida + item.cantidad_devuelta;
      if (total !== item.cantidad_entregada) {
        alert(
          `Error en ${item.nombre}: Llevó ${item.cantidad_entregada}, pero anotaste ${item.cantidad_vendida} vendidos y ${item.cantidad_devuelta} devueltos. La suma no coincide.`,
        );
        return;
      }
    }

    const payload = {
      items: items.map((i) => ({
        producto_id: i.producto_id,
        cantidad_vendida: i.cantidad_vendida,
        cantidad_devuelta: i.cantidad_devuelta,
      })),
    };

    this.remitoService.cerrarRemito(this.remitoEnCierre().id, payload).subscribe({
      next: () => {
        alert('✅ Remito cerrado. El stock se actualizó correctamente.');

        // 1. Ocultamos el panel amarillo automáticamente
        this.cancelarCierre();

        // 2. Cerramos el panel de detalle por si estaba abierto
        this.cerrarDetalle();

        // 3. Truco para forzar el redibujado de la tabla
        this.remitosHistorial.set([]);
        this.cargarHistorialRemitos();
        this.cargarDatosBase();
      },
      error: () => alert('Error al cerrar el remito.'),
    });
  }

  // --- FUNCIONES PARA VER EL DETALLE E IMPRIMIR (Sin cambios) ---
  remitoEnDetalle = signal<any>(null);
  itemsEnDetalle = signal<any[]>([]);
  itemsAgrupados = signal<{ [key: string]: any[] }>({});

  abrirDetalle(remito: any) {
    this.remitoEnDetalle.set(remito);
    this.remitoService.getRemitoItems(remito.id).subscribe({
      next: (items) => {
        this.itemsEnDetalle.set(items);
        const agrupados = items.reduce((acc, item) => {
          const cat = item.categoria || 'Sin Categoría';
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(item);
          return acc;
        }, {});
        this.itemsAgrupados.set(agrupados);
      },
      error: () => alert('Error al cargar los detalles del remito.'),
    });
  }

  cerrarDetalle() {
    this.remitoEnDetalle.set(null);
    this.itemsEnDetalle.set([]);
    this.itemsAgrupados.set({});
  }

  imprimirRemito() {
    window.print();
  }
}
