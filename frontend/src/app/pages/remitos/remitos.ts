import { Component, signal, afterNextRender, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RemitoService } from '../../services/remito.service';
import { VendedorService, Vendedor } from '../../services/vendedor.service';
import { ProductoService, Producto } from '../../services/producto.service';
import { ConfigService } from '../../services/config.service';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

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

  // Más nuevos primero, así la página 1 siempre tiene lo último que se hizo
  remitosFiltrados = computed(() => {
    const vendedor = this.filtroVendedor();
    const lista = vendedor
      ? this.remitosHistorial().filter((r) => r.vendedor === vendedor)
      : this.remitosHistorial();
    return [...lista].sort((a, b) => b.id - a.id);
  });

  // --- Paginación del historial ---
  readonly remitosPorPagina = 15;
  paginaRemitos = signal<number>(1);
  totalPaginasRemitos = computed(() =>
    Math.max(1, Math.ceil(this.remitosFiltrados().length / this.remitosPorPagina)),
  );
  // Si la página quedó fuera de rango (por un filtro o un borrado), se acomoda sola
  paginaRemitosActual = computed(() => Math.min(this.paginaRemitos(), this.totalPaginasRemitos()));
  remitosPagina = computed(() => {
    const desde = (this.paginaRemitosActual() - 1) * this.remitosPorPagina;
    return this.remitosFiltrados().slice(desde, desde + this.remitosPorPagina);
  });

  vendedores = signal<Vendedor[]>([]);
  productos = signal<Producto[]>([]);
  vendedorSeleccionado = signal<number | string>('');
  itemsCarrito = signal<any[]>([]);
  remitoLiquidacion = signal<any | null>(null);
  itemsLiquidacion = signal<any[]>([]);
  totalNeto = signal<number>(0);
  ticketImpresion = signal<any | null>(null);
  dropdownAbierto = signal<string>('');
  terminoBusqueda = signal<string>('');
  mostrarDropdown = signal<boolean>(false);
  remitoEnDetalle = signal<any>(null);
  itemsEnDetalle = signal<any[]>([]);
  itemsAgrupados = signal<{ [key: string]: any[] }>({});
  modoImpresion = signal<'remito' | 'ticket' | ''>('');
  remitoEnEdicion = signal<any | null>(null);

  vistaDetalleActual = signal<'entrega' | 'liquidacion' | 'pagos'>('entrega');
  pagosEnDetalle = signal<any[]>([]);

  // --- Liquidación por vendedora ---
  liquidacionVendedor = signal<{ id: number; nombre: string } | null>(null);
  remitosPendientesVendedor = signal<any[]>([]);
  remitosSeleccionados = signal<number[]>([]);
  gruposLiquidacion = signal<any[]>([]);
  totalNetoVendedor = signal<number>(0);
  comisionVendedor: number = 25;
  busquedaDevolucion = signal<string>('');
  mostrarDropdownDevolucion = signal<boolean>(false);

  // --- Devoluciones parciales (sin liquidar) ---
  devolucionVendedor = signal<{ id: number; nombre: string } | null>(null);
  codigosEnCalle = signal<any[]>([]); // [{ producto_id, codigo, nombre, enCalle }]
  itemsDevolucion = signal<any[]>([]); // [{ producto_id, codigo, nombre, cantidad, enCalle }]
  observacionDevolucion: string = '';
  busquedaDevParcial = signal<string>('');
  mostrarDropdownDevParcial = signal<boolean>(false);
  historialDevoluciones = signal<any[]>([]);
  devolucionesRemito = signal<any[]>([]); // historial en el detalle del remito

  // --- Cuenta corriente por vendedora ---
  cuentaVendedor = signal<{ id: number; nombre: string } | null>(null);
  cuentaDatos = signal<any | null>(null);
  montoPagoCuenta: number | null = null;
  observacionPagoCuenta: string = '';
  pagosCuentaActivos = computed(() =>
    (this.cuentaDatos()?.pagos || []).filter((p: any) => p.estado === 'Activa'),
  );

  // --- Sumar stock a un producto existente ---
  mostrarIngresoRapido = signal<boolean>(false);
  busquedaIngreso = signal<string>('');
  productoIngreso = signal<any | null>(null);
  cantidadIngreso: number = 1;

  // --- Alta de producto nuevo desde remitos (botón +) ---
  mostrarNuevoProducto = signal<boolean>(false);
  nuevoProducto: any = this.productoNuevoVacio();

  // Comisión default desde config
  comisionPorcentaje: number = 25;

  categoriaSeleccionada = signal<string>('');

  // Extrae las categorías únicas de los productos que ya tenés cargados
  categoriasDisponibles = computed(() => {
    const catSet = new Set(
      this.productos()
        .map((p) => p.categoria)
        .filter((c) => !!c),
    );
    return Array.from(catSet).sort();
  });

  get nombreVendedor() {
    return this.configService.nombreVendedor;
  }
  get nombreVendedorPlural() {
    return this.configService.nombreVendedorPlural;
  }
  get nombreProducto() {
    return this.configService.nombreProducto;
  }
  get nombreProductoPlural() {
    return this.configService.nombreProductoPlural;
  }
  get nombreNegocio() {
    return this.configService.nombreNegocio;
  }

  constructor(
    private remitoService: RemitoService,
    private vendedorService: VendedorService,
    private productoService: ProductoService,
    public configService: ConfigService,
  ) {
    afterNextRender(() => {
      this.comisionPorcentaje = this.configService.comisionDefault;
      this.cargarDatosBase();
      this.cargarHistorialRemitos();
    });
  }

  @HostListener('document:click')
  cerrarDropdowns() {
    this.dropdownAbierto.set('');
    this.mostrarDropdown.set(false);
    this.mostrarDropdownDevolucion.set(false); // <-- agregar
    this.mostrarDropdownDevParcial.set(false);
  }

  buscarJoya(termino: string) {
    this.terminoBusqueda.set(termino);
    this.mostrarDropdown.set(true);
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
    this.paginaRemitos.set(1);
    this.dropdownAbierto.set('');
  }

  irAPaginaRemitos(pagina: number) {
    const destino = Math.min(Math.max(1, pagina), this.totalPaginasRemitos());
    this.paginaRemitos.set(destino);
    document.getElementById('historial-remitos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  obtenerNombreVendedorSeleccionado() {
    const id = Number(this.vendedorSeleccionado());
    if (!id) return '';
    const vend = this.vendedores().find((v) => v.id === id);
    return vend ? vend.nombre : '';
  }

  productosDisponibles = computed(() => {
    const busqueda = this.terminoBusqueda().toLowerCase();
    const categoria = this.categoriaSeleccionada(); // Agregamos esto

    const filtrados = this.productos().filter((p) => {
      if (p.stock_disponible <= 0) return false;

      // NUEVO: Si hay una categoría seleccionada y no coincide, lo descartamos
      if (categoria && p.categoria !== categoria) return false;

      // Lógica de búsqueda original
      if (!busqueda) return true;
      return (
        (p.codigo?.toLowerCase() || '').includes(busqueda) ||
        (p.nombre?.toLowerCase() || '').includes(busqueda) ||
        (p.categoria?.toLowerCase() || '').includes(busqueda) ||
        (p.material?.toLowerCase() || '').includes(busqueda)
      );
    });

    // ORDENAMIENTO ALFANUMÉRICO INTELIGENTE (AN01 antes que AN10)
    return filtrados.sort((a, b) => {
      const codA = a.codigo || '';
      const codB = b.codigo || '';
      return codA.localeCompare(codB, undefined, { numeric: true, sensitivity: 'base' });
    });
  });

  // Códigos en calle de los remitos seleccionados, filtrados por la búsqueda
  gruposFiltradosDevolucion = computed(() => {
    const b = this.busquedaDevolucion().toLowerCase().trim();
    const grupos = this.gruposLiquidacion();
    if (!b) return grupos;
    return grupos.filter(
      (g) =>
        (g.codigo || '').toLowerCase().includes(b) || (g.nombre || '').toLowerCase().includes(b),
    );
  });

  // Códigos que la vendedora tiene en calle (todos sus remitos pendientes), filtrados
  codigosFiltradosDevParcial = computed(() => {
    const b = this.busquedaDevParcial().toLowerCase().trim();
    const codigos = this.codigosEnCalle();
    if (!b) return codigos;
    return codigos.filter(
      (c) =>
        (c.codigo || '').toLowerCase().includes(b) || (c.nombre || '').toLowerCase().includes(b),
    );
  });

  // Resumen por producto para el detalle: entregado / devuelto parcial / queda
  resumenDevolucionesRemito = computed(() => {
    const activas = this.devolucionesRemito().filter((d) => d.estado === 'Activa');
    const porProducto: { [id: number]: number } = {};
    for (const d of activas) porProducto[d.producto_id] = (porProducto[d.producto_id] || 0) + d.cantidad;
    return this.itemsEnDetalle()
      .filter((i) => porProducto[i.producto_id])
      .map((i) => ({
        codigo: i.codigo,
        nombre: i.nombre,
        entregado: i.cantidad_entregada,
        devueltoParcial: porProducto[i.producto_id],
        queda: i.cantidad_entregada - porProducto[i.producto_id],
      }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true, sensitivity: 'base' }));
  });

  resultadosIngreso = computed(() => {
    const b = this.busquedaIngreso().toLowerCase().trim();
    if (!b) return [];
    return this.productos()
      .filter(
        (p) =>
          (p.codigo || '').toLowerCase().includes(b) || (p.nombre || '').toLowerCase().includes(b),
      )
      .sort((a, c) =>
        (a.codigo || '').localeCompare(c.codigo || '', undefined, {
          numeric: true,
          sensitivity: 'base',
        }),
      )
      .slice(0, 8);
  });

  cargarDatosBase() {
    this.vendedorService.getVendedores().subscribe((v) => this.vendedores.set(v));
    this.productoService.getProductos().subscribe((p) => this.productos.set(p));
  }

  cargarHistorialRemitos() {
    this.remitoService.getRemitos().subscribe((r) => this.remitosHistorial.set(r));
  }

  quitarDelRemito(index: number) {
    const items = this.itemsCarrito();
    items.splice(index, 1);
    this.itemsCarrito.set([...items]);
  }

  guardarRemitoFinal() {
    const vendId = Number(this.vendedorSeleccionado());
    const items = this.itemsCarrito();
    const remitoEdit = this.remitoEnEdicion();

    if (!vendId)
      return Swal.fire(
        'Faltan datos',
        `Por favor, seleccioná un ${this.nombreVendedor}.`,
        'warning',
      );
    if (items.length === 0)
      return Swal.fire(
        'Remito vacío',
        `Agregá al menos un ${this.nombreProducto} al remito.`,
        'warning',
      );

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
      items: items.map((item) => ({
        producto_id: item.producto_id,
        cantidad: item.cantidad,
        precio: item.precio, // <-- FUNDAMENTAL QUE SE GUARDE
      })),
    };

    const operacion = remitoEdit
      ? this.remitoService.editarRemito(remitoEdit.id, payload)
      : this.remitoService.crearRemito(payload);

    operacion.subscribe({
      next: () => {
        Swal.fire({
          icon: 'success',
          title: remitoEdit ? '¡Remito Actualizado!' : '¡Remito Generado!',
          text: 'Se guardó correctamente y el stock fue recalculado.',
          confirmButtonColor: this.configService.config()?.negocio.colorPrincipal,
        });
        this.vendedorSeleccionado.set('');
        this.itemsCarrito.set([]);
        this.remitoEnEdicion.set(null);
        this.cerrarDetalle();
        this.cargarHistorialRemitos();
        this.cargarDatosBase();
      },
      error: () => Swal.fire('Error', 'Hubo un problema al procesar el remito.', 'error'),
    });
    return;
  }

  abrirDetalle(remito: any) {
    this.vistaDetalleActual.set('entrega');
    this.remitoEnDetalle.set(remito);
    // El detalle se dibuja abajo de todo: bajamos hasta él apenas aparece
    setTimeout(
      () => document.getElementById('detalle-remito')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      50,
    );
    this.devolucionesRemito.set([]);
    this.remitoService.getDevolucionesRemito(remito.id).subscribe({
      next: (devs) => this.devolucionesRemito.set(devs),
    });
    this.remitoService.getRemitoItems(remito.id).subscribe({
      next: (items) => {
        this.itemsEnDetalle.set(items);
        const agrupados = items.reduce((acc: any, item: any) => {
          const cat = item.categoria || 'Sin Categoría';
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(item);
          return acc;
        }, {});
        this.itemsAgrupados.set(agrupados);

        if (remito.estado === 'Cerrado') {
          // --- NUEVA LLAMADA AL HISTORIAL DE PAGOS ---
          this.remitoService.getPagosRemito(remito.id).subscribe((pagos: any[]) => {
            this.pagosEnDetalle.set(pagos);
          });
          // -------------------------------------------

          let suma = 0;
          let sumaTotalVendido = 0; // <-- NUEVA VARIABLE

          items.forEach((item: any) => {
            if (item.cantidad_vendida > 0) {
              const descuento = item.precio * ((remito.comision || 0) / 100);
              suma += (item.precio - descuento) * item.cantidad_vendida; // Lo que rinde (neto)
              sumaTotalVendido += item.precio * item.cantidad_vendida; // Lo que vendió (bruto)
            }
          });

          this.ticketImpresion.set({
            vendedor: remito.vendedor,
            fecha: new Date(),
            comision: remito.comision || 0,
            items,
            totalNeto: suma,
            totalVendido: sumaTotalVendido, // <-- LO GUARDAMOS EN EL TICKET
            idRemito: remito.id, // <-- LO GUARDAMOS PARA USARLO EN EL PDF Nativo
          });
        } else {
          this.ticketImpresion.set(null);
        }
      },
      error: () => Swal.fire('Error', 'No se pudieron cargar los detalles.', 'error'),
    });
  }

  editarRemitoHistorico(remito: any) {
    this.remitoEnEdicion.set(remito);
    this.vendedorSeleccionado.set(remito.vendedor_id);
    this.remitoService.getRemitoItems(remito.id).subscribe((items) => {
      if (remito.estado === 'Pendiente' && items.some((i: any) => i.cantidad_devuelta > 0)) {
        this.cancelarEdicionRemito();
        Swal.fire('No se puede editar', 'Este remito tiene devoluciones parciales. Anulalas primero.', 'warning');
        return;
      }
      const carritoEdit = items.map((i: any) => {
        const prodBase = this.productos().find((p) => p.id === i.producto_id);
        const stockActual = prodBase ? prodBase.stock_disponible : 0;
        return {
          producto_id: i.producto_id,
          codigo: i.codigo,
          nombre: i.nombre,
          cantidad: i.cantidad_entregada,
          stock_maximo: i.cantidad_entregada + stockActual,
          precio: i.precio,
        };
      });
      this.itemsCarrito.set(carritoEdit);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  cancelarEdicionRemito() {
    this.remitoEnEdicion.set(null);
    this.vendedorSeleccionado.set('');
    this.itemsCarrito.set([]);
  }

  // Botón "Cerrar" del detalle: además de cerrarlo, vuelve a la lista
  cerrarDetalleYVolver() {
    this.cerrarDetalle();
    setTimeout(
      () => document.getElementById('historial-remitos')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      50,
    );
  }

  cerrarDetalle() {
    this.remitoEnDetalle.set(null);
    this.itemsEnDetalle.set([]);
    this.itemsAgrupados.set({});
    this.pagosEnDetalle.set([]);
    this.devolucionesRemito.set([]);
  }

  // Nos dice cuántas unidades de un producto ya están cargadas en el remito actual
  cantidadEnCarrito(productoId: number): number {
    const item = this.itemsCarrito().find((i) => i.producto_id === productoId);
    return item ? item.cantidad : 0;
  }

  estaEnCarrito(productoId: number): boolean {
    return this.itemsCarrito().some((item) => item.producto_id === productoId);
  }

  toggleProductoCarrito(producto: any, event: Event) {
    event.stopPropagation();
    const items = this.itemsCarrito();
    const existe = items.find((item) => item.producto_id === producto.id);
    if (existe) {
      this.itemsCarrito.set(items.filter((item) => item.producto_id !== producto.id));
    } else {
      this.itemsCarrito.set([
        ...items,
        {
          producto_id: producto.id,
          codigo: producto.codigo,
          nombre: producto.nombre,
          cantidad: 1,
          stock_maximo: producto.stock_disponible,
          precio: producto.precio,
        },
      ]);
    }
  }

  agregarAlCarritoConCantidad(producto: any, cantidadStr: string, event: Event): boolean {
    event.stopPropagation(); // Evita que se cierre el menú desplegable
    const cantidadAInsertar = parseInt(cantidadStr, 10);

    // Validamos que no ponga letras o números negativos
    if (isNaN(cantidadAInsertar) || cantidadAInsertar < 1) {
      return false;
    }

    const items = this.itemsCarrito();
    const existe = items.find((item) => item.producto_id === producto.id);

    // Calculamos cuánto habría en total en el carrito si sumamos esto
    const cantidadActualEnCarrito = existe ? existe.cantidad : 0;
    const nuevaCantidadTotal = cantidadActualEnCarrito + cantidadAInsertar;

    // Validamos el stock
    if (nuevaCantidadTotal > producto.stock_disponible) {
      Swal.fire(
        'Stock insuficiente',
        `Solo hay ${producto.stock_disponible} disponibles en total. Ya tenés ${cantidadActualEnCarrito} en el remito.`,
        'warning',
      );
      return false;
    }

    if (existe) {
      // Si ya estaba en el carrito, le sumamos la nueva cantidad
      const nuevosItems = items.map((item) =>
        item.producto_id === producto.id ? { ...item, cantidad: nuevaCantidadTotal } : item,
      );
      this.itemsCarrito.set(nuevosItems);
    } else {
      // Si no estaba, lo agregamos por primera vez
      this.itemsCarrito.set([
        ...items,
        {
          producto_id: producto.id,
          codigo: producto.codigo,
          nombre: producto.nombre,
          cantidad: cantidadAInsertar,
          stock_maximo: producto.stock_disponible,
          precio: producto.precio,
        },
      ]);
    }

    // Mini notificación para que sepa que se agregó sin cerrarle la búsqueda
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `Agregaste ${cantidadAInsertar}x ${producto.codigo}`,
      showConfirmButton: false,
      timer: 1500,
    });
    return true;
  }

  // ============================================================
  // CARGA CON TECLADO: escribir el código + Enter suma 1 y limpia
  // ============================================================

  // "AN0148", "an148" y "148" (con Anillos elegido) son el mismo código
  private claveCodigo(codigo: string): { letras: string; numero: string } {
    const limpio = (codigo || '').toUpperCase().replace(/\s+/g, '');
    const m = limpio.match(/^([A-ZÑ]*)(\d+)$/);
    if (!m) return { letras: limpio, numero: '' };
    return { letras: m[1], numero: String(parseInt(m[2], 10)) };
  }

  private coincideCodigo(codigo: string, termino: string): boolean {
    const c = this.claveCodigo(codigo);
    const t = this.claveCodigo(termino);
    if (!t.numero) return c.letras === t.letras && !c.numero; // códigos sin número (raro)
    if (t.letras) return c.letras === t.letras && c.numero === t.numero;
    return c.numero === t.numero; // solo el número: lo acota la categoría elegida
  }

  agregarPorEnter(event: Event) {
    event.preventDefault();
    const termino = this.terminoBusqueda().trim();
    if (!termino) return;

    const categoria = this.categoriaSeleccionada();
    const candidatos = this.productos().filter(
      (p) => (!categoria || p.categoria === categoria) && this.coincideCodigo(p.codigo || '', termino),
    );

    const aviso = (title: string) =>
      Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title, showConfirmButton: false, timer: 2500 });

    if (candidatos.length === 0) {
      aviso(`No hay ningún código ${termino}${categoria ? ' en ' + categoria : ''}`);
      return;
    }
    if (candidatos.length > 1) {
      const codigos = candidatos.map((p) => p.codigo).join(', ');
      aviso(`Hay varios (${codigos}). Elegí la categoría o escribí el código completo.`);
      return;
    }

    const producto = candidatos[0];
    if (producto.stock_disponible <= 0) {
      aviso(`${producto.codigo} no tiene stock disponible`);
      return;
    }

    if (this.agregarAlCarritoConCantidad(producto, '1', event)) {
      // Queda listo para escribir el próximo código
      this.terminoBusqueda.set('');
    }
  }

  imprimirVistaActual() {
    // ELIMINAMOS el Swal.fire previo porque bloqueaba la pantalla al imprimir
    this.remitoService
      .solicitarPdfNativo(
        this.remitoEnDetalle().id,
        this.remitoEnDetalle().vendedor,
        this.vistaDetalleActual(),
      )
      .subscribe({
        next: (exito) => {
          if (exito) {
            Swal.fire('¡Éxito!', 'El PDF se guardó correctamente.', 'success');
          }
        },
        error: () => {
          Swal.fire('Error', 'No se pudo generar el PDF nativo.', 'error');
        },
      });
  }
  abrirModalLiquidacion(remito: any) {
    this.remitoLiquidacion.set(remito);
    this.remitoService.getRemitoItems(remito.id).subscribe({
      next: (itemsBackend) => {
        const itemsClonados = itemsBackend
          .map((item: any) => {
            const llevo = item.cantidad_entregada || item.cantidad;
            const previa = item.cantidad_devuelta || 0; // devoluciones parciales ya registradas
            const pendiente = llevo - previa;
            return {
              ...item,
              cantidad_entregada: llevo,
              devuelta_previa: previa,
              pendiente,
              cantidad_vendida: 0,
              cantidad_devuelta: pendiente,
            };
          })
          .sort((a: any, b: any) =>
            a.codigo.localeCompare(b.codigo, undefined, { numeric: true, sensitivity: 'base' }),
          );

        this.itemsLiquidacion.set(itemsClonados);
        this.comisionPorcentaje = this.configService.comisionDefault;
        this.calcularTotalNeto();
      },
      error: () =>
        Swal.fire('Error', 'No se pudieron cargar los productos de este remito.', 'error'),
    });
  }

  cerrarModalLiquidacion() {
    this.remitoLiquidacion.set(null);
    this.itemsLiquidacion.set([]);
  }

  actualizarCantidades(index: number, tipo: 'vendida' | 'devuelta') {
    const items = this.itemsLiquidacion();
    const item = items[index];
    const total = item.pendiente;
    if (!item.cantidad_vendida || item.cantidad_vendida < 0) item.cantidad_vendida = 0;
    if (!item.cantidad_devuelta || item.cantidad_devuelta < 0) item.cantidad_devuelta = 0;
    if (tipo === 'vendida') {
      if (item.cantidad_vendida > total) item.cantidad_vendida = total;
      item.cantidad_devuelta = total - item.cantidad_vendida;
    } else {
      if (item.cantidad_devuelta > total) item.cantidad_devuelta = total;
      item.cantidad_vendida = total - item.cantidad_devuelta;
    }
    this.calcularTotalNeto();
  }

  calcularTotalNeto() {
    let suma = 0;
    this.itemsLiquidacion().forEach((item) => {
      if (item.cantidad_vendida > 0) {
        const descuento = item.precio * (this.comisionPorcentaje / 100);
        suma += (item.precio - descuento) * item.cantidad_vendida;
      }
    });
    this.totalNeto.set(suma);
  }

  confirmarCierreYTicket() {
    const remito = this.remitoLiquidacion();
    if (!remito) return;

    // --- VALIDACIÓN DE SEGURIDAD RESTAURADA ---
    for (const item of this.itemsLiquidacion()) {
      const suma = (item.cantidad_vendida || 0) + (item.cantidad_devuelta || 0);
      if (suma !== item.pendiente) {
        Swal.fire({
          title: 'Faltan declarar productos',
          html: `Revisá el código <b>${item.codigo}</b>.<br>Tenía ${item.pendiente} en calle, pero hay ${item.cantidad_vendida} vendidos y ${item.cantidad_devuelta} devueltos.`,
          icon: 'warning',
          confirmButtonColor: this.configService.config()?.negocio.colorPrincipal,
        });
        return;
      }
    }
    // ------------------------------------------
    const totalRendirCalculado = this.totalNeto();

    const datosCierre = {
      items: this.itemsLiquidacion(),
      comision: this.comisionPorcentaje,
      total_rendir: totalRendirCalculado, // <-- NUEVO: Enviamos el total al backend
    };

    Swal.fire({
      title: 'Liquidando...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    this.remitoService.cerrarRemito(remito.id, datosCierre).subscribe({
      next: () => {
        Swal.fire('¡Éxito!', 'Remito cerrado y deuda registrada.', 'success');
        this.cerrarModalLiquidacion();
        this.cargarHistorialRemitos();
        this.cerrarDetalle();
      },
      error: () => Swal.fire('Error', 'No se pudo cerrar el remito.', 'error'),
    });
  }

  // Helper para el template: categorías agrupadas para imprimir
  // Helper para el template: categorías agrupadas para imprimir
  get categoriasParaImpresion(): string[] {
    // 1. Agarramos las categorías oficiales de la config (para mantener tu orden)
    const categoriasOficiales = this.configService.categorias.map((c) => c.nombre);

    // 2. Agarramos cualquier otra categoría "vieja o rara" que tengan los productos de este remito específico
    const categoriasReales = Object.keys(this.itemsAgrupados());

    // 3. Las unificamos sin repetir, y aseguramos que esté 'Sin Categoría' al final
    const todas = new Set([...categoriasOficiales, ...categoriasReales, 'Sin Categoría']);

    return Array.from(todas);
  }

  abrirLiquidacionVendedor() {
    const nombre = this.filtroVendedor();
    const vend = this.vendedores().find((v) => v.nombre === nombre);
    if (!vend) {
      Swal.fire('Elegí una vendedora', 'Seleccioná una en el filtro de arriba.', 'warning');
      return;
    }
    this.comisionVendedor = this.configService.comisionDefault;
    this.remitosSeleccionados.set([]);
    this.gruposLiquidacion.set([]);
    this.totalNetoVendedor.set(0);
    this.liquidacionVendedor.set({ id: vend.id!, nombre: vend.nombre });
    this.remitoService.getPendientesVendedor(vend.id!).subscribe({
      next: (remitos) => this.remitosPendientesVendedor.set(remitos),
      error: () => Swal.fire('Error', 'No se pudieron cargar los remitos pendientes.', 'error'),
    });
  }

  // ============================================================
  // DEVOLUCIONES PARCIALES
  // ============================================================

  abrirDevolucionVendedor() {
    const nombre = this.filtroVendedor();
    const vend = this.vendedores().find((v) => v.nombre === nombre);
    if (!vend) {
      Swal.fire('Elegí una vendedora', 'Seleccioná una en el filtro de arriba.', 'warning');
      return;
    }
    this.itemsDevolucion.set([]);
    this.observacionDevolucion = '';
    this.busquedaDevParcial.set('');
    this.devolucionVendedor.set({ id: vend.id!, nombre: vend.nombre });
    this.cargarDatosDevolucion(vend.id!);
  }

  cargarDatosDevolucion(vendedorId: number) {
    this.remitoService.getPendientesVendedor(vendedorId).subscribe({
      next: (remitos) => {
        // Sumamos lo que tiene en calle de cada producto entre todos sus remitos
        const mapa: { [id: number]: any } = {};
        for (const r of remitos) {
          for (const it of r.items) {
            if (!mapa[it.producto_id]) {
              mapa[it.producto_id] = {
                producto_id: it.producto_id,
                codigo: it.codigo,
                nombre: it.nombre,
                enCalle: 0,
              };
            }
            mapa[it.producto_id].enCalle += it.pendiente;
          }
        }
        const codigos = Object.values(mapa).sort((a: any, b: any) =>
          a.codigo.localeCompare(b.codigo, undefined, { numeric: true, sensitivity: 'base' }),
        );
        this.codigosEnCalle.set(codigos);
      },
      error: () => Swal.fire('Error', 'No se pudieron cargar los remitos pendientes.', 'error'),
    });
    this.remitoService.getDevolucionesVendedor(vendedorId).subscribe({
      next: (devs) => this.historialDevoluciones.set(devs),
    });
  }

  cerrarDevolucionVendedor() {
    this.devolucionVendedor.set(null);
    this.codigosEnCalle.set([]);
    this.itemsDevolucion.set([]);
    this.historialDevoluciones.set([]);
    this.observacionDevolucion = '';
    this.busquedaDevParcial.set('');
  }

  buscarDevParcial(termino: string) {
    this.busquedaDevParcial.set(termino);
    this.mostrarDropdownDevParcial.set(true);
  }

  agregarItemDevolucion(codigo: any, cantidadStr: string, event: Event) {
    event.stopPropagation();
    const cantidad = parseInt(cantidadStr, 10) || 0;
    if (cantidad < 1) return;

    const items = this.itemsDevolucion();
    const existe = items.find((i) => i.producto_id === codigo.producto_id);
    const yaCargado = existe ? existe.cantidad : 0;

    if (yaCargado + cantidad > codigo.enCalle) {
      Swal.fire(
        'Supera lo que tiene en calle',
        `De ${codigo.codigo} tiene ${codigo.enCalle} en calle y ya cargaste ${yaCargado}.`,
        'warning',
      );
      return;
    }

    if (existe) {
      existe.cantidad += cantidad;
      this.itemsDevolucion.set([...items]);
    } else {
      this.itemsDevolucion.set([...items, { ...codigo, cantidad }]);
    }

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `Devolución: ${cantidad}x ${codigo.codigo}`,
      showConfirmButton: false,
      timer: 1200,
    });
  }

  editarCantidadDevolucion(item: any, valStr: any) {
    let v = parseInt(valStr, 10) || 1;
    if (v < 1) v = 1;
    if (v > item.enCalle) v = item.enCalle;
    item.cantidad = v;
    this.itemsDevolucion.set([...this.itemsDevolucion()]);
  }

  quitarItemDevolucion(index: number) {
    const items = [...this.itemsDevolucion()];
    items.splice(index, 1);
    this.itemsDevolucion.set(items);
  }

  totalUnidadesDevolucion(): number {
    return this.itemsDevolucion().reduce((s, i) => s + i.cantidad, 0);
  }

  async confirmarDevolucion() {
    const v = this.devolucionVendedor();
    const items = this.itemsDevolucion();
    if (!v) return;
    if (items.length === 0) {
      Swal.fire('Sin productos', 'Cargá al menos un producto devuelto.', 'warning');
      return;
    }

    const result = await Swal.fire({
      title: '¿Registrar la devolución?',
      html:
        `Vuelven al stock <b>${this.totalUnidadesDevolucion()}</b> unidad(es) de ${v.nombre}.<br>` +
        `Los remitos siguen abiertos.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, registrar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: this.configService.config()?.negocio.colorPrincipal,
    });
    if (!result.isConfirmed) return;

    const payload = {
      items: items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
      observacion: this.observacionDevolucion.trim(),
    };

    this.remitoService.registrarDevolucion(v.id, payload).subscribe({
      next: (resp) => {
        const remitos = [...new Set((resp.asignaciones || []).map((a: any) => a.remito_id))];
        Swal.fire(
          'Devolución registrada',
          `La mercadería volvió al stock. Se descontó de: #${remitos.join(', #')}.`,
          'success',
        );
        this.itemsDevolucion.set([]);
        this.observacionDevolucion = '';
        this.cargarDatosDevolucion(v.id);
        this.cargarDatosBase();
        this.cargarHistorialRemitos();
      },
      error: (e) =>
        Swal.fire('Error', e?.error?.error || 'No se pudo registrar la devolución.', 'error'),
    });
  }

  async anularDevolucion(dev: any) {
    const v = this.devolucionVendedor();
    const result = await Swal.fire({
      title: `¿Anular la devolución del ${new Date(dev.fecha).toLocaleDateString('es-AR')}?`,
      html: 'La mercadería vuelve a figurar en calle y se descuenta del stock.<br>La devolución queda en el historial como anulada.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, anular',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
    });
    if (!result.isConfirmed) return;

    this.remitoService.anularDevolucion(dev.id).subscribe({
      next: () => {
        Swal.fire('Anulada', 'La devolución fue anulada y el stock revertido.', 'success');
        if (v) this.cargarDatosDevolucion(v.id);
        this.cargarDatosBase();
      },
      error: (e) =>
        Swal.fire('No se pudo anular', e?.error?.error || 'Error al anular la devolución.', 'error'),
    });
  }

  // Agrupa los ítems de una devolución por código: "PU104 x3 (#48, #58)"
  resumenItemsDevolucion(dev: any): { codigo: string; nombre: string; cantidad: number; remitos: string }[] {
    const mapa: { [cod: string]: any } = {};
    for (const it of dev.items || []) {
      if (!mapa[it.codigo]) mapa[it.codigo] = { codigo: it.codigo, nombre: it.nombre, cantidad: 0, remitos: new Set() };
      mapa[it.codigo].cantidad += it.cantidad;
      mapa[it.codigo].remitos.add(it.remito_id);
    }
    return Object.values(mapa)
      .map((m: any) => ({ ...m, remitos: '#' + [...m.remitos].join(', #') }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true, sensitivity: 'base' }));
  }

  cerrarLiquidacionVendedor() {
    this.liquidacionVendedor.set(null);
    this.remitosPendientesVendedor.set([]);
    this.remitosSeleccionados.set([]);
    this.gruposLiquidacion.set([]);
  }

  estaRemitoSeleccionado(id: number): boolean {
    return this.remitosSeleccionados().includes(id);
  }

  toggleRemitoSeleccion(id: number) {
    const sel = this.remitosSeleccionados();
    this.remitosSeleccionados.set(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
    this.construirGrupos();
  }

  seleccionarTodosRemitos() {
    this.remitosSeleccionados.set(this.remitosPendientesVendedor().map((r) => r.remito_id));
    this.construirGrupos();
  }

  deseleccionarRemitos() {
    this.remitosSeleccionados.set([]);
    this.construirGrupos();
  }

  // Arma la vista agrupada por código sobre los remitos seleccionados (viejo -> nuevo)
  construirGrupos() {
    const sel = new Set(this.remitosSeleccionados());
    const remitos = this.remitosPendientesVendedor()
      .filter((r) => sel.has(r.remito_id))
      .sort(
        (a, b) =>
          (a.fecha_salida || '').localeCompare(b.fecha_salida || '') || a.remito_id - b.remito_id,
      );

    const mapa: { [codigo: string]: any } = {};
    for (const r of remitos) {
      for (const it of r.items) {
        if (!mapa[it.codigo]) {
          mapa[it.codigo] = {
            codigo: it.codigo,
            nombre: it.nombre,
            totalPendiente: 0,
            totalDevuelto: 0,
            slots: [],
          };
        }
        mapa[it.codigo].totalPendiente += it.pendiente;
        mapa[it.codigo].slots.push({
          remito_id: r.remito_id,
          fecha_salida: r.fecha_salida,
          producto_id: it.producto_id,
          precio: it.precio,
          pendiente: it.pendiente,
          devuelto: 0,
        });
      }
    }

    const grupos = Object.values(mapa).sort((a: any, b: any) =>
      a.codigo.localeCompare(b.codigo, undefined, { numeric: true, sensitivity: 'base' }),
    );
    this.gruposLiquidacion.set(grupos);
    this.calcularTotalNetoVendedor();
  }

  // Reparte el total devuelto de un código: viejo primero (FIFO)
  distribuirTotal(grupo: any, totalStr: any) {
    let restante = Math.max(0, parseInt(totalStr, 10) || 0);
    if (restante > grupo.totalPendiente) restante = grupo.totalPendiente;
    grupo.totalDevuelto = restante;
    for (const slot of grupo.slots) {
      const asignar = Math.min(slot.pendiente, restante);
      slot.devuelto = asignar;
      restante -= asignar;
    }
    this.gruposLiquidacion.set([...this.gruposLiquidacion()]);
    this.calcularTotalNetoVendedor();
  }

  buscarDevolucion(termino: string) {
    this.busquedaDevolucion.set(termino);
    this.mostrarDropdownDevolucion.set(true);
  }

  // Suma 1 al código elegido y reparte FIFO (viejo -> nuevo)
  agregarDevolucionDeGrupo(grupo: any, cantidadStr: string, event: Event) {
    event.stopPropagation();
    const cantidad = parseInt(cantidadStr, 10) || 0;
    if (cantidad < 1) return;

    const yaDevuelto = grupo.totalDevuelto || 0;
    const nuevoTotal = yaDevuelto + cantidad;

    if (nuevoTotal > grupo.totalPendiente) {
      Swal.fire(
        'Supera lo que tiene en calle',
        `De ${grupo.codigo} hay ${grupo.totalPendiente} en calle y ya cargaste ${yaDevuelto}. No podés sumar ${cantidad} más.`,
        'warning',
      );
      return;
    }

    // Reusa el reparto FIFO que ya tenés
    this.distribuirTotal(grupo, nuevoTotal);

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `Devolución: ${cantidad}x ${grupo.codigo}`,
      showConfirmButton: false,
      timer: 1200,
    });
  }

  // Edición manual de un remito puntual dentro del código
  editarSlot(grupo: any, slot: any, valStr: any) {
    let v = parseInt(valStr, 10) || 0;
    if (v < 0) v = 0;
    if (v > slot.pendiente) v = slot.pendiente;
    slot.devuelto = v;
    grupo.totalDevuelto = grupo.slots.reduce((s: number, x: any) => s + (x.devuelto || 0), 0);
    this.gruposLiquidacion.set([...this.gruposLiquidacion()]);
    this.calcularTotalNetoVendedor();
  }

  calcularTotalNetoVendedor() {
    let suma = 0;
    const com = Number(this.comisionVendedor) || 0;
    for (const grupo of this.gruposLiquidacion()) {
      for (const slot of grupo.slots) {
        const vendida = slot.pendiente - (slot.devuelto || 0);
        if (vendida > 0) {
          const descuento = slot.precio * (com / 100);
          suma += (slot.precio - descuento) * vendida;
        }
      }
    }
    this.totalNetoVendedor.set(suma);
  }

  async confirmarLiquidacionVendedor() {
    const v = this.liquidacionVendedor();
    if (!v) return;
    if (this.remitosSeleccionados().length === 0) {
      Swal.fire('Sin remitos', 'Seleccioná al menos un remito para liquidar.', 'warning');
      return;
    }

    const remitosMap: { [id: number]: any } = {};
    for (const id of this.remitosSeleccionados()) remitosMap[id] = { remito_id: id, items: [] };
    for (const grupo of this.gruposLiquidacion()) {
      for (const slot of grupo.slots) {
        if (!remitosMap[slot.remito_id]) {
          remitosMap[slot.remito_id] = { remito_id: slot.remito_id, items: [] };
        }
        remitosMap[slot.remito_id].items.push({
          producto_id: slot.producto_id,
          cantidad_devuelta: slot.devuelto || 0,
        });
      }
    }

    const payload = {
      comision: Number(this.comisionVendedor) || 0,
      remitos: Object.values(remitosMap),
    };

    const cantidad = this.remitosSeleccionados().length;
    const result = await Swal.fire({
      title: '¿Confirmás la liquidación?',
      html: `Se van a cerrar <b>${cantidad}</b> remito(s) y registrar la deuda correspondiente.<br>Los remitos que no seleccionaste quedan abiertos.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, liquidar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: this.configService.config()?.negocio.colorPrincipal,
    });
    if (!result.isConfirmed) return;

    Swal.fire({
      title: 'Liquidando...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });
    this.remitoService.liquidarVendedor(v.id, payload).subscribe({
      next: () => {
        Swal.fire('¡Éxito!', 'Remitos liquidados y stock actualizado.', 'success');
        this.cerrarLiquidacionVendedor();
        this.cargarHistorialRemitos();
        this.cargarDatosBase();
      },
      error: (e) => Swal.fire('Error', e?.error?.error || 'No se pudo liquidar.', 'error'),
    });
  }

  // Lo que debe un remito cerrado. Los de cuenta corriente salen del reparto de pagos a cuenta;
  // los liquidados antes de la cuenta corriente siguen con total - abonado (botón Cobrar).
  deudaRemito(r: any): number {
    if (r.en_cuenta) return r.pendiente || 0;
    return Math.round(((r.total_rendir || 0) - (r.abonado || 0)) * 100) / 100;
  }

  registrarPago(remito: any) {
    // Redondeado a centavos: la comisión puede dejar decimales (ej. 937,5)
    const deuda = this.deudaRemito(remito);

    Swal.fire({
      title: `Pago - Remito #${remito.id}`,
      html: `
      <div style="text-align: left;">
        <p><b>Vendedora:</b> ${remito.vendedor}</p>
        <p><b>Deuda actual:</b> <span style="color: #dc3545; font-weight:bold;">$${deuda.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span></p>
        <hr>
        <label>Monto entregado por la vendedora:</label>
      </div>
    `,
      input: 'number',
      // Antes era min 1 y step 1: con una deuda menor a $1 o con centavos el input
      // quedaba inválido y no dejaba cobrar. Ahora validamos nosotros.
      inputAttributes: { min: '0.01', max: deuda.toString(), step: 'any' },
      inputValue: deuda,
      inputValidator: (valor) => {
        const monto = Number(valor);
        if (!monto || monto <= 0) return 'Ingresá un monto mayor a 0.';
        if (monto > deuda + 0.001)
          return `No puede ser mayor a la deuda ($${deuda.toLocaleString('es-AR', { maximumFractionDigits: 2 })}).`;
        return null;
      },
      showCancelButton: true,
      confirmButtonText: 'Registrar Cobro',
      confirmButtonColor: '#28a745',
      cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (result.isConfirmed && result.value > 0) {
        this.remitoService.registrarPago(remito.id, Number(result.value)).subscribe({
          next: () => {
            Swal.fire('¡Cobrado!', 'El pago fue asentado correctamente.', 'success');
            this.cargarHistorialRemitos();
            this.cerrarDetalle();
          },
          error: () => Swal.fire('Error', 'No se pudo registrar el pago.', 'error'),
        });
      }
    });
  }

  async reabrirRemito(remito: any) {
    const cobrado = remito.abonado || 0;
    const cubiertoCuenta = remito.en_cuenta ? (remito.cubierto || 0) - cobrado : 0;
    const result = await Swal.fire({
      title: `¿Reabrir el remito #${remito.id}?`,
      html:
        `Se va a deshacer la liquidación y el remito vuelve a Pendiente.<br>` +
        `El stock se reajusta como estaba antes de cerrarlo.` +
        (cobrado > 0
          ? `<br><br><b>Ojo:</b> este remito ya tiene $${cobrado.toLocaleString('es-AR')} cobrados. Los pagos se conservan.`
          : '') +
        (cubiertoCuenta > 0
          ? `<br><br><b>Cuenta corriente:</b> los $${cubiertoCuenta.toLocaleString('es-AR')} que cubrían este remito vuelven a la cuenta de ${remito.vendedor} y se aplican a sus otros remitos (o quedan a favor).`
          : ''),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, reabrir',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
    });
    if (!result.isConfirmed) return;

    this.remitoService.reabrirRemito(remito.id).subscribe({
      next: () => {
        Swal.fire('Reabierto', 'Ya podés editarlo y volver a liquidarlo.', 'success');
        this.cargarHistorialRemitos();
        this.cargarDatosBase();
      },
      error: (e) =>
        Swal.fire('Error', e?.error?.error || 'No se pudo reabrir el remito.', 'error'),
    });
  }
  // ============================================================
  // CUENTA CORRIENTE POR VENDEDORA
  // ============================================================

  abrirCuentaVendedor() {
    const nombre = this.filtroVendedor();
    const vend = this.vendedores().find((v) => v.nombre === nombre);
    if (!vend) {
      Swal.fire('Elegí una vendedora', 'Seleccioná una en el filtro de arriba.', 'warning');
      return;
    }
    // El detalle tiene su propia zona de impresión: lo cerramos para que no se mezcle en el PDF
    this.cerrarDetalle();
    this.montoPagoCuenta = null;
    this.observacionPagoCuenta = '';
    this.cuentaDatos.set(null);
    this.cuentaVendedor.set({ id: vend.id!, nombre: vend.nombre });
    this.cargarCuenta(vend.id!);
  }

  cargarCuenta(vendedorId: number) {
    this.remitoService.getCuentaVendedor(vendedorId).subscribe({
      next: (c) => this.cuentaDatos.set(c),
      error: () => Swal.fire('Error', 'No se pudo cargar la cuenta corriente.', 'error'),
    });
  }

  cerrarCuentaVendedor() {
    this.cuentaVendedor.set(null);
    this.cuentaDatos.set(null);
    this.montoPagoCuenta = null;
    this.observacionPagoCuenta = '';
  }

  formatoPesos(n: number): string {
    return '$ ' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  }

  // "Debe $ X" / "A favor $ X" / "Al día"
  textoSaldo(saldo: number): string {
    if (saldo > 0) return `Debe ${this.formatoPesos(saldo)}`;
    if (saldo < 0) return `A favor ${this.formatoPesos(-saldo)}`;
    return 'Al día';
  }

  async registrarPagoCuenta() {
    const v = this.cuentaVendedor();
    if (!v) return;
    const monto = Math.round((Number(this.montoPagoCuenta) || 0) * 100) / 100;
    if (monto <= 0) {
      Swal.fire('Monto inválido', 'Ingresá cuánto entregó la vendedora.', 'warning');
      return;
    }
    const saldoAntes = this.cuentaDatos()?.saldo || 0;
    const saldoDespues = Math.round((saldoAntes - monto) * 100) / 100;

    const result = await Swal.fire({
      title: '¿Registrar el pago?',
      html:
        `Pago a cuenta de <b>${v.nombre}</b>: <b>${this.formatoPesos(monto)}</b><br>` +
        `Se aplica del remito liquidado más viejo al más nuevo.<br><br>` +
        `Saldo: ${this.textoSaldo(saldoAntes)} → <b>${this.textoSaldo(saldoDespues)}</b>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, registrar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#28a745',
    });
    if (!result.isConfirmed) return;

    this.remitoService
      .registrarPagoCuenta(v.id, { monto, observacion: this.observacionPagoCuenta.trim() })
      .subscribe({
        next: () => {
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: `Pago de ${this.formatoPesos(monto)} registrado`,
            showConfirmButton: false,
            timer: 1800,
          });
          this.montoPagoCuenta = null;
          this.observacionPagoCuenta = '';
          this.cargarCuenta(v.id);
          this.cargarHistorialRemitos();
        },
        error: (e) => Swal.fire('Error', e?.error?.error || 'No se pudo registrar el pago.', 'error'),
      });
  }

  async anularPagoCuenta(pago: any) {
    const v = this.cuentaVendedor();
    const result = await Swal.fire({
      title: `¿Anular el pago de ${this.formatoPesos(pago.monto)}?`,
      html:
        `Del ${new Date(pago.fecha).toLocaleDateString('es-AR')}. La cuenta se recalcula sin este pago.<br>` +
        `Queda en el historial como anulado.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, anular',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
    });
    if (!result.isConfirmed) return;

    this.remitoService.anularPagoCuenta(pago.id).subscribe({
      next: () => {
        Swal.fire('Anulado', 'El pago fue anulado y la cuenta recalculada.', 'success');
        if (v) this.cargarCuenta(v.id);
        this.cargarHistorialRemitos();
      },
      error: (e) => Swal.fire('No se pudo anular', e?.error?.error || 'Error al anular el pago.', 'error'),
    });
  }

  guardarPdfCuenta() {
    const d = this.cuentaDatos();
    if (!d) return;
    const hoy = new Date();
    const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    const nombre = `Cuenta_${d.vendedor.nombre}_${fecha}`
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, '_');

    // Con esta clase el @media print deja SOLO el resumen (ver styles.css)
    document.body.classList.add('imprimiendo-cuenta');
    const limpiar = () => document.body.classList.remove('imprimiendo-cuenta');
    this.remitoService.guardarPdf(nombre).subscribe({
      next: (ok) => {
        limpiar();
        if (ok) Swal.fire('¡Éxito!', 'El PDF se guardó correctamente.', 'success');
      },
      error: () => {
        limpiar();
        Swal.fire('Error', 'No se pudo generar el PDF.', 'error');
      },
    });
  }

  abrirIngresoRapido() {
    this.busquedaIngreso.set('');
    this.productoIngreso.set(null);
    this.cantidadIngreso = 1;
    this.mostrarIngresoRapido.set(true);
  }

  cerrarIngresoRapido() {
    this.mostrarIngresoRapido.set(false);
  }

  elegirProductoIngreso(p: any, event: Event) {
    event.stopPropagation();
    this.productoIngreso.set(p);
    this.cantidadIngreso = 1;
  }

  volverABuscarIngreso() {
    this.productoIngreso.set(null);
  }

  // Si no lo encontró, la mandamos directo al alta de producto nuevo
  pasarANuevoProducto() {
    this.cerrarIngresoRapido();
    this.abrirNuevoProducto();
  }

  confirmarIngreso() {
    const existente = this.productoIngreso();
    if (!existente) return Swal.fire('Elegí un producto', 'Buscalo por código o nombre.', 'warning');

    const cant = Number(this.cantidadIngreso) || 0;
    if (cant < 1) return Swal.fire('Cantidad inválida', 'Ingresá al menos 1 unidad.', 'warning');

    const payload = { ...existente, stock_real: existente.stock_real + cant };
    this.productoService.editarProducto(existente.id, payload).subscribe({
      next: () => {
        Swal.fire(
          'Stock actualizado',
          `${existente.codigo}: ahora hay ${existente.stock_real + cant} unidades.`,
          'success',
        );
        this.cargarDatosBase();
        this.cerrarIngresoRapido();
      },
      error: (e) =>
        Swal.fire('Error', e?.error?.error || 'No se pudo actualizar el stock.', 'error'),
    });
    return;
  }

  // ============================================================
  // ALTA DE PRODUCTO NUEVO (mismas reglas que Inventario)
  // ============================================================

  private productoNuevoVacio() {
    return { categoria: '', material: '', medida: '', nombre: '', precio: null, stock_real: 1 };
  }

  get pideMedida(): boolean {
    return (
      this.configService.usaMedida &&
      !!this.nuevoProducto.categoria &&
      this.nuevoProducto.categoria === this.configService.categoriaConMedida
    );
  }

  abrirNuevoProducto() {
    this.nuevoProducto = this.productoNuevoVacio();
    // Si ya estaba filtrando por una categoría, la dejamos elegida
    const cat = this.categoriaSeleccionada();
    if (cat && this.configService.categorias.some((c) => c.nombre === cat)) this.nuevoProducto.categoria = cat;
    this.mostrarNuevoProducto.set(true);
  }

  cerrarNuevoProducto() {
    this.mostrarNuevoProducto.set(false);
  }

  cambiarCategoriaNuevo(cat: string) {
    this.nuevoProducto.categoria = cat;
    if (!this.pideMedida) this.nuevoProducto.medida = '';
  }

  guardarNuevoProducto() {
    const np = this.nuevoProducto;
    const color = this.configService.config()?.negocio.colorPrincipal;
    const falta = (title: string, text: string) =>
      Swal.fire({ icon: 'warning', title, text, confirmButtonColor: color });

    if (!np.categoria) return falta('Falta la categoría', `Elegí qué tipo de ${this.nombreProducto} es.`);
    if (this.pideMedida && !np.medida)
      return falta('Falta la medida', `Como elegiste "${np.categoria}", elegí la medida.`);
    if (!np.material) return falta('Falta el material', 'Elegí el material.');
    if (np.precio == null || np.precio === '' || Number(np.precio) < 0)
      return falta('Falta el precio', 'Ingresá un precio válido.');
    const cant = Number(np.stock_real);
    if (!cant || cant < 1) return falta('Falta la cantidad', 'Ingresá cuántas unidades entran.');

    this.productoService
      .crearProducto({
        categoria: np.categoria,
        material: np.material,
        medida: this.pideMedida ? np.medida : '',
        nombre: (np.nombre || '').trim(),
        precio: Number(np.precio),
        stock_real: cant,
        stock_disponible: cant,
      })
      .subscribe({
        next: (r: any) => {
          const codigo = r?.codigo || '';
          this.cerrarNuevoProducto();
          // Recargamos y dejamos el código escrito en el buscador:
          // con Enter se suma al remito que está armando.
          this.productoService.getProductos().subscribe((p) => {
            this.productos.set(p);
            this.categoriaSeleccionada.set(np.categoria);
            this.terminoBusqueda.set(codigo);
            this.mostrarDropdown.set(true);
            setTimeout(() => document.getElementById('busqueda-remito')?.focus(), 50);
          });
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: `Se creó ${codigo} con ${cant} u. Enter para sumarlo al remito.`,
            showConfirmButton: false,
            timer: 3000,
          });
        },
        error: (e) => Swal.fire('Error', e?.error?.error || 'No se pudo crear el producto.', 'error'),
      });
    return;
  }
}
