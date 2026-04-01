import { Component, signal, afterNextRender, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RemitoService } from '../../services/remito.service';
import { VendedorService, Vendedor } from '../../services/vendedor.service';
import { ProductoService, Producto } from '../../services/producto.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-remitos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './remitos.html',
  styleUrl: './remitos.css',
})
export class RemitosComponent {
  remitosHistorial = signal<any[]>([]);
  filtroVendedor = signal<string>('');

  remitosFiltrados = computed(() => {
    const vendedora = this.filtroVendedor();
    if (!vendedora) return this.remitosHistorial();
    return this.remitosHistorial().filter((r) => r.vendedor === vendedora);
  });

  vendedores = signal<Vendedor[]>([]);
  productos = signal<Producto[]>([]);

  vendedorSeleccionado = signal<number | string>('');
  productoSeleccionado = signal<number | string>('');
  cantidadSeleccionada = signal<number>(1);
  itemsCarrito = signal<any[]>([]);

  // --- CONTROL DE MENÚS DESPLEGABLES CUSTOM ---
  dropdownAbierto = signal<string>('');

  @HostListener('document:click')
  cerrarDropdowns() {
    this.dropdownAbierto.set('');
  }

  toggleDropdown(menu: string, event: Event) {
    event.stopPropagation();
    this.dropdownAbierto.set(this.dropdownAbierto() === menu ? '' : menu);
  }

  setVendedorNuevo(id: number | string) {
    this.vendedorSeleccionado.set(id);
    this.dropdownAbierto.set('');
  }

  setVendedorFiltro(nombre: string) {
    this.filtroVendedor.set(nombre);
    this.dropdownAbierto.set('');
  }

  // Helper para mostrar el nombre del vendedor seleccionado en el form
  obtenerNombreVendedorSeleccionado() {
    const id = Number(this.vendedorSeleccionado());
    if (!id) return '';
    const vend = this.vendedores().find((v) => v.id === id);
    return vend ? vend.nombre : '';
  }

  // --- BUSCADOR INTELIGENTE VISUAL ---
  terminoBusqueda = signal<string>('');
  mostrarDropdown = signal<boolean>(false);

  buscarJoya(termino: string) {
    this.terminoBusqueda.set(termino);
    this.productoSeleccionado.set('');
    this.mostrarDropdown.set(true);
  }

  seleccionarProducto(p: any) {
    this.productoSeleccionado.set(p.id);
    this.terminoBusqueda.set(`${p.codigo} - ${p.nombre}`);
    this.mostrarDropdown.set(false);
  }

  ocultarDropdown() {
    setTimeout(() => this.mostrarDropdown.set(false), 200);
  }

  productosDisponibles = computed(() => {
    const busqueda = this.terminoBusqueda().toLowerCase();
    const enCarritoIds = this.itemsCarrito().map((item) => item.producto_id);

    return this.productos().filter((p) => {
      if (enCarritoIds.includes(p.id!)) return false;
      if (p.stock_disponible <= 0) return false;
      if (!busqueda) return true;

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

    if (!prodId || cant <= 0) {
      return Swal.fire('Atención', 'Seleccioná una joya y una cantidad válida.', 'warning');
    }
    const producto = this.productos().find((p) => p.id === prodId);
    if (!producto) return;

    if (cant > producto.stock_disponible) {
      return Swal.fire(
        'Stock Insuficiente',
        `Solo tenés ${producto.stock_disponible} disponibles de esta joya.`,
        'warning',
      );
    }

    const itemsActuales = this.itemsCarrito();
    this.itemsCarrito.set([
      ...itemsActuales,
      {
        producto_id: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        cantidad: cant,
        stock_maximo: producto.stock_disponible,
      },
    ]);

    this.productoSeleccionado.set('');
    this.cantidadSeleccionada.set(1);
    this.terminoBusqueda.set('');
    return;
  }

  quitarDelRemito(index: number) {
    const itemsActuales = this.itemsCarrito();
    itemsActuales.splice(index, 1);
    this.itemsCarrito.set([...itemsActuales]);
  }

  guardarRemitoFinal() {
    const vendId = Number(this.vendedorSeleccionado());
    const items = this.itemsCarrito();

    if (!vendId)
      return Swal.fire('Faltan datos', 'Por favor, seleccioná una vendedora.', 'warning');
    if (items.length === 0)
      return Swal.fire('Remito vacío', 'Agregá al menos una joya al remito.', 'warning');

    for (const item of items) {
      if (item.cantidad < 1 || item.cantidad > item.stock_maximo) {
        return Swal.fire(
          'Cantidad inválida',
          `Revisá la cantidad de: ${item.codigo}. Debe ser entre 1 y ${item.stock_maximo}.`,
          'error',
        );
      }
    }

    const payload = {
      vendedor_id: vendId,
      items: items.map((item) => ({ producto_id: item.producto_id, cantidad: item.cantidad })),
    };

    this.remitoService.crearRemito(payload).subscribe({
      next: () => {
        Swal.fire({
          icon: 'success',
          title: '¡Remito Generado!',
          text: 'Se guardó correctamente y el stock fue actualizado.',
          confirmButtonColor: '#B87366',
        });

        this.vendedorSeleccionado.set('');
        this.itemsCarrito.set([]);
        this.cancelarCierre();
        this.cerrarDetalle();
        this.remitosHistorial.set([]);
        this.cargarHistorialRemitos();
        this.cargarDatosBase();
      },
      error: () => Swal.fire('Error', 'Hubo un problema al guardar el remito.', 'error'),
    });

    return;
  }

  // --- FUNCIONES PARA CERRAR REMITO ---
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
      error: () => Swal.fire('Error', 'No se pudieron cargar los items del remito.', 'error'),
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
        return Swal.fire(
          'Error de cálculos',
          `Error en ${item.nombre}: Llevó ${item.cantidad_entregada}, pero anotaste ${item.cantidad_vendida} vendidos y ${item.cantidad_devuelta} devueltos. La suma no coincide.`,
          'error',
        );
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
        Swal.fire({
          icon: 'success',
          title: '¡Remito Cerrado!',
          text: 'El stock y las ventas se actualizaron correctamente.',
          confirmButtonColor: '#B87366',
        });

        this.cancelarCierre();
        this.cerrarDetalle();
        this.remitosHistorial.set([]);
        this.cargarHistorialRemitos();
        this.cargarDatosBase();
      },
      error: () => Swal.fire('Error', 'No se pudo cerrar el remito.', 'error'),
    });

    return;
  }

  // --- FUNCIONES PARA VER EL DETALLE E IMPRIMIR ---
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
      error: () => Swal.fire('Error', 'No se pudieron cargar los detalles del remito.', 'error'),
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
