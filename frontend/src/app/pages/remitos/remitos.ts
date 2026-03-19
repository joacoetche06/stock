import { Component, signal, afterNextRender } from '@angular/core';
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
  vendedores = signal<Vendedor[]>([]);
  productos = signal<Producto[]>([]);

  vendedorSeleccionado = signal<number | string>('');
  productoSeleccionado = signal<number | string>('');
  cantidadSeleccionada = signal<number>(1);
  itemsCarrito = signal<any[]>([]);

  // --- NUEVAS VARIABLES PARA EL CIERRE DE REMITO ---
  remitoEnCierre = signal<any>(null); // Guarda el remito que estamos cerrando
  itemsEnCierre = signal<any[]>([]); // Guarda los items de ese remito

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

    if (!prodId || cant <= 0) return alert('Seleccioná un producto y cantidad.');
    const producto = this.productos().find((p) => p.id === prodId);
    if (!producto) return;

    if (cant > producto.stock_disponible) {
      return alert(`Solo tenés ${producto.stock_disponible} disponibles.`);
    }

    const itemsActuales = this.itemsCarrito();
    this.itemsCarrito.set([
      ...itemsActuales,
      {
        producto_id: producto.id,
        nombre: producto.nombre,
        cantidad: cant,
      },
    ]);

    this.productoSeleccionado.set('');
    this.cantidadSeleccionada.set(1);
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

    const payload = {
      vendedor_id: vendId,
      items: items.map((item) => ({ producto_id: item.producto_id, cantidad: item.cantidad })),
    };

    this.remitoService.crearRemito(payload).subscribe({
      next: () => {
        alert('✅ Remito generado con éxito.');
        this.vendedorSeleccionado.set('');
        this.itemsCarrito.set([]);
        this.cargarHistorialRemitos();
        this.cargarDatosBase();
      },
      error: (err) => alert('Error al guardar el remito.'),
    });
  }

  // --- NUEVAS FUNCIONES PARA CERRAR REMITO ---

  abrirPanelCierre(remito: any) {
    this.remitoEnCierre.set(remito);
    // Buscamos qué se llevó exactamente en este remito
    this.remitoService.getRemitoItems(remito.id).subscribe({
      next: (items) => {
        // Le agregamos a cada item los campos para que el usuario anote qué pasó
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

    // Pequeña validación para no meter mal los dedos
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
        this.cancelarCierre();
        this.cargarHistorialRemitos();
        this.cargarDatosBase(); // Refresca el stock oculto
      },
      error: () => alert('Error al cerrar el remito.'),
    });
  }

  // --- NUEVAS FUNCIONES PARA VER EL DETALLE Y IMPRIMIR ---
  remitoEnDetalle = signal<any>(null);
  itemsEnDetalle = signal<any[]>([]);

  // Guardaremos los items agrupados por categoría para la impresión
  itemsAgrupados = signal<{ [key: string]: any[] }>({});

  abrirDetalle(remito: any) {
    this.remitoEnDetalle.set(remito);
    this.remitoService.getRemitoItems(remito.id).subscribe({
      next: (items) => {
        this.itemsEnDetalle.set(items);

        // Agrupamos los items por su categoría
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
    window.print(); // Abre el diálogo de impresión del navegador
  }
}
