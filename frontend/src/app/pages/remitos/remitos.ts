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

  // Comisión default desde config
  comisionPorcentaje: number = 25;

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
    return this.productos().filter((p) => {
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
        precio: item.precio // <-- FUNDAMENTAL QUE SE GUARDE
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
    const vista = this.vistaDetalleActual(); // Puede ser 'entrega', 'liquidacion' o 'pagos'
    Swal.fire({
      title: 'Generando PDF...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    setTimeout(() => {
      let elementId = '';
      let prefijoArchivo = '';

      // Identificamos qué pestaña está abierta
      if (vista === 'entrega') {
        elementId = 'zona-impresion';
        prefijoArchivo = 'Remito';
      } else if (vista === 'liquidacion') {
        elementId = 'ticket-liquidacion';
        prefijoArchivo = 'Liquidacion';
      } else if (vista === 'pagos') {
        elementId = 'registro-pagos';
        prefijoArchivo = 'Historial_Pagos';
      }

      const element = document.getElementById(elementId);

      if (element) {
        // 🪄 EL TRUCO MAGICO: Forzamos el ancho para que la foto salga en calidad A4
        const originalWidth = element.style.width;
        const originalPadding = element.style.padding;
        const originalOverflow = element.style.overflowX;
        
        element.style.width = '1000px';
        element.style.padding = '40px'; 
        element.style.overflowX = 'visible'; // Evita que se corte la foto

        html2canvas(element, {
          scale: 2,
          scrollY: -window.scrollY, 
        }).then((canvas) => {
          // Restauramos la vista al instante
          element.style.width = originalWidth;
          element.style.padding = originalPadding;
          element.style.overflowX = originalOverflow;

          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF('p', 'mm', 'a4');

          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          const imgHeight = (canvas.height * pdfWidth) / canvas.width;

          let heightLeft = imgHeight;
          let position = 0;

          // Pegamos la primer hoja
          pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
          heightLeft -= pageHeight;

          // Hojas siguientes (Paginación)
          while (heightLeft > 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
            heightLeft -= pageHeight;
          }

          const nombreArchivo = `${prefijoArchivo}_${this.remitoEnDetalle().id}_${this.remitoEnDetalle().vendedor}.pdf`;

          pdf.save(nombreArchivo);
          Swal.close();
        });
      }
    }, 800);
  }

  abrirModalLiquidacion(remito: any) {
    this.remitoLiquidacion.set(remito);
    this.remitoService.getRemitoItems(remito.id).subscribe({
      next: (itemsBackend) => {
        const itemsClonados = itemsBackend.map((item: any) => ({
          ...item,
          cantidad_entregada: item.cantidad_entregada || item.cantidad,
          cantidad_vendida: 0,
          cantidad_devuelta: item.cantidad_entregada || item.cantidad,
        }));
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

  // Calculamos el total exacto que se guarda en la BD
  const totalRendirCalculado = this.totalNeto(); 

  const datosCierre = { 
    items: this.itemsLiquidacion(), 
    comision: this.comisionPorcentaje,
    total_rendir: totalRendirCalculado // <-- NUEVO: Enviamos el total al backend
  };

  Swal.fire({ title: 'Liquidando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  this.remitoService.cerrarRemito(remito.id, datosCierre).subscribe({
    next: () => {
      Swal.fire('¡Éxito!', 'Remito cerrado y deuda registrada.', 'success');
      this.cerrarModalLiquidacion();
      this.cargarHistorialRemitos();
    },
    error: () => Swal.fire('Error', 'No se pudo cerrar el remito.', 'error')
  });
}

  // Helper para el template: categorías agrupadas para imprimir
  get categoriasParaImpresion(): string[] {
    return [...this.configService.categorias.map((c) => c.nombre), 'Sin Categoría'];
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
    cancelButtonText: 'Cancelar'
  }).then((result) => {
    if (result.isConfirmed && result.value > 0) {
      this.remitoService.registrarPago(remito.id, Number(result.value)).subscribe({
        next: () => {
          Swal.fire('¡Cobrado!', 'El pago fue asentado correctamente.', 'success');
          this.cargarHistorialRemitos();
        },
        error: () => Swal.fire('Error', 'No se pudo registrar el pago.', 'error')
      });
    }
  });
}
}
