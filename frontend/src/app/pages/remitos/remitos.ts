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

  remitosFiltrados = computed(() => {
    const vendedor = this.filtroVendedor();
    if (!vendedor) return this.remitosHistorial();
    return this.remitosHistorial().filter((r) => r.vendedor === vendedor);
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
    this.dropdownAbierto.set('');
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

  cerrarDetalle() {
    this.remitoEnDetalle.set(null);
    this.itemsEnDetalle.set([]);
    this.itemsAgrupados.set({});
    this.pagosEnDetalle.set([]);
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

  agregarAlCarritoConCantidad(producto: any, cantidadStr: string, event: Event) {
    event.stopPropagation(); // Evita que se cierre el menú desplegable
    const cantidadAInsertar = parseInt(cantidadStr, 10);

    // Validamos que no ponga letras o números negativos
    if (isNaN(cantidadAInsertar) || cantidadAInsertar < 1) {
      return;
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
      return;
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
          .map((item: any) => ({
            ...item,
            cantidad_entregada: item.cantidad_entregada || item.cantidad,
            cantidad_vendida: 0,
            cantidad_devuelta: item.cantidad_entregada || item.cantidad,
          }))
          .sort((a: any, b: any) => a.codigo.localeCompare(b.codigo));

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
    const total = item.cantidad_entregada;
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
      if (suma !== item.cantidad_entregada) {
        Swal.fire({
          title: 'Faltan declarar productos',
          html: `Revisá el código <b>${item.codigo}</b>.<br>Se entregaron ${item.cantidad_entregada}, pero hay ${item.cantidad_vendida} vendidos y ${item.cantidad_devuelta} devueltos.`,
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

  registrarPago(remito: any) {
    const deuda = remito.total_rendir - remito.abonado;

    Swal.fire({
      title: `Pago - Remito #${remito.id}`,
      html: `
      <div style="text-align: left;">
        <p><b>Vendedora:</b> ${remito.vendedor}</p>
        <p><b>Deuda actual:</b> <span style="color: #dc3545; font-weight:bold;">$${deuda.toLocaleString()}</span></p>
        <hr>
        <label>Monto entregado por la vendedora:</label>
      </div>
    `,
      input: 'number',
      inputAttributes: { min: '1', max: deuda.toString(), step: '1' },
      inputValue: deuda,
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
    const result = await Swal.fire({
      title: `¿Reabrir el remito #${remito.id}?`,
      html:
        `Se va a deshacer la liquidación y el remito vuelve a Pendiente.<br>` +
        `El stock se reajusta como estaba antes de cerrarlo.` +
        (cobrado > 0
          ? `<br><br><b>Ojo:</b> este remito ya tiene $${cobrado.toLocaleString('es-AR')} cobrados. Los pagos se conservan.`
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
}
