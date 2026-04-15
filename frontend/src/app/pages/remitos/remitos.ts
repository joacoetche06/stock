import { Component, signal, afterNextRender, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RemitoService } from '../../services/remito.service';
import { VendedorService, Vendedor } from '../../services/vendedor.service';
import { ProductoService, Producto } from '../../services/producto.service';
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

  // ==========================================
  // VARIABLES PARA LA LIQUIDACIÓN Y CIERRE
  // ==========================================
  remitoLiquidacion = signal<any | null>(null);
  itemsLiquidacion = signal<any[]>([]);
  comisionPorcentaje: number = 25; // Porcentaje por defecto (Adri lo puede cambiar)
  totalNeto = signal<number>(0);
  ticketImpresion = signal<any | null>(null);

  // --- CONTROL DE MENÚS DESPLEGABLES CUSTOM ---
  dropdownAbierto = signal<string>('');

  @HostListener('document:click')
  cerrarDropdowns() {
    this.dropdownAbierto.set('');
    this.mostrarDropdown.set(false); // Le decimos que también cierre el buscador si hacemos clic afuera
  }

  // --- BUSCADOR INTELIGENTE VISUAL ---
  terminoBusqueda = signal<string>('');
  mostrarDropdown = signal<boolean>(false);

  buscarJoya(termino: string) {
    this.terminoBusqueda.set(termino);
    this.productoSeleccionado.set('');
    this.mostrarDropdown.set(true);
  }

  // ¡BORRAMOS LA FUNCIÓN ocultarDropdown() COMPLETA PORQUE YA NO HACE FALTA!

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

  productosDisponibles = computed(() => {
    const busqueda = this.terminoBusqueda().toLowerCase();

    // Ya NO filtramos (ocultamos) los que están en el carrito.
    // Los dejamos visibles para que Adri pueda tildar/destildar los checkboxes.
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

  // --- VARIABLES PARA EL CIERRE DE REMITO ---
  // remitoEnCierre = signal<any>(null);
  // itemsEnCierre = signal<any[]>([]);

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

  quitarDelRemito(index: number) {
    const itemsActuales = this.itemsCarrito();
    itemsActuales.splice(index, 1);
    this.itemsCarrito.set([...itemsActuales]);
  }

  guardarRemitoFinal() {
    const vendId = Number(this.vendedorSeleccionado());
    const items = this.itemsCarrito();
    const remitoEdit = this.remitoEnEdicion(); // Detectamos si estamos editando

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

    // --- BLOQUE NUEVO: ELECCIÓN DE RUTA (CREAR O EDITAR) ---
    const operacion = remitoEdit
      ? this.remitoService.editarRemito(remitoEdit.id, payload)
      : this.remitoService.crearRemito(payload);

    operacion.subscribe({
      next: () => {
        Swal.fire({
          icon: 'success',
          title: remitoEdit ? '¡Remito Actualizado!' : '¡Remito Generado!',
          text: 'Se guardó correctamente y el stock fue recalculado.',
          confirmButtonColor: '#B87366',
        });

        // Limpieza total del formulario y estados
        this.vendedorSeleccionado.set('');
        this.itemsCarrito.set([]);
        this.remitoEnEdicion.set(null); // MUY IMPORTANTE: Salimos del modo edición
        this.cerrarDetalle();
        this.cargarHistorialRemitos();
        this.cargarDatosBase();
      },
      error: () => Swal.fire('Error', 'Hubo un problema al procesar el remito.', 'error'),
    });
    return;
  }

  // --- FUNCIONES PARA CERRAR REMITO ---
  // abrirPanelCierre(remito: any) {
  //   this.remitoEnCierre.set(remito);
  //   this.remitoService.getRemitoItems(remito.id).subscribe({
  //     next: (items) => {
  //       const itemsPreparados = items.map((i) => ({
  //         ...i,
  //         cantidad_vendida: 0,
  //         cantidad_devuelta: 0,
  //       }));
  //       this.itemsEnCierre.set(itemsPreparados);
  //     },
  //     error: () => Swal.fire('Error', 'No se pudieron cargar los items del remito.', 'error'),
  //   });
  // }

  // cancelarCierre() {
  //   this.remitoEnCierre.set(null);
  //   this.itemsEnCierre.set([]);
  // }

  // confirmarCierre() {
  //   const items = this.itemsEnCierre();
  //   for (let item of items) {
  //     const total = item.cantidad_vendida + item.cantidad_devuelta;
  //     if (total !== item.cantidad_entregada) {
  //       return Swal.fire(
  //         'Error de cálculos',
  //         `Error en ${item.nombre}: Llevó ${item.cantidad_entregada}, pero anotaste ${item.cantidad_vendida} vendidos y ${item.cantidad_devuelta} devueltos. La suma no coincide.`,
  //         'error',
  //       );
  //     }
  //   }

  //   const payload = {
  //     items: items.map((i) => ({
  //       producto_id: i.producto_id,
  //       cantidad_vendida: i.cantidad_vendida,
  //       cantidad_devuelta: i.cantidad_devuelta,
  //     })),
  //   };

  //   this.remitoService.cerrarRemito(this.remitoEnCierre().id, payload).subscribe({
  //     next: () => {
  //       Swal.fire({
  //         icon: 'success',
  //         title: '¡Remito Cerrado!',
  //         text: 'El stock y las ventas se actualizaron correctamente.',
  //         confirmButtonColor: '#B87366',
  //       });

  //       this.cancelarCierre();
  //       this.cerrarDetalle();
  //       this.remitosHistorial.set([]);
  //       this.cargarHistorialRemitos();
  //       this.cargarDatosBase();
  //     },
  //     error: () => Swal.fire('Error', 'No se pudo cerrar el remito.', 'error'),
  //   });

  //   return;
  // }

  // --- FUNCIONES PARA VER EL DETALLE E IMPRIMIR ---
  remitoEnDetalle = signal<any>(null);
  itemsEnDetalle = signal<any[]>([]);
  itemsAgrupados = signal<{ [key: string]: any[] }>({});

  modoImpresion = signal<'remito' | 'ticket' | ''>('');

  remitoEnEdicion = signal<any | null>(null);
  vistaDetalleActual = signal<'entrega' | 'liquidacion'>('entrega');

  abrirDetalle(remito: any) {
    this.vistaDetalleActual.set('entrega');
    this.remitoEnDetalle.set(remito);
    this.remitoService.getRemitoItems(remito.id).subscribe({
      next: (items) => {
        this.itemsEnDetalle.set(items);
        // Agrupamos por categoría (tu código original)
        const agrupados = items.reduce((acc: any, item: any) => {
          const cat = item.categoria || 'Sin Categoría';
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(item);
          return acc;
        }, {});
        this.itemsAgrupados.set(agrupados);

        // --- NUEVO: PREPARAMOS EL TICKET INVISIBLE SOLO SI ESTÁ CERRADO ---
        if (remito.estado === 'Cerrado') {
          let suma = 0;
          items.forEach((item: any) => {
            if (item.cantidad_vendida > 0) {
              const descuento = item.precio * ((remito.comision || 0) / 100);
              suma += (item.precio - descuento) * item.cantidad_vendida;
            }
          });

          this.ticketImpresion.set({
            vendedor: remito.vendedor,
            fecha: new Date(), // Pone la fecha del momento de impresión
            comision: remito.comision || 0,
            items: items,
            totalNeto: suma,
          });
        } else {
          this.ticketImpresion.set(null); // Si está pendiente, no hay ticket de liquidación
        }
      },
      error: () => Swal.fire('Error', 'No se pudieron cargar los detalles.', 'error'),
    });
  }

  // NUEVAS FUNCIONES DE EDICIÓN
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
  }

  // --- NUEVA LÓGICA DE SELECCIÓN MÚLTIPLE (CHECKBOXES) ---
  estaEnCarrito(productoId: number): boolean {
    return this.itemsCarrito().some((item) => item.producto_id === productoId);
  }

  toggleProductoCarrito(producto: any, event: Event) {
    event.stopPropagation(); // Evitamos que el dropdown se cierre
    const itemsActuales = this.itemsCarrito();
    const existe = itemsActuales.find((item) => item.producto_id === producto.id);

    if (existe) {
      // Si ya estaba tildado, lo sacamos del remito
      this.itemsCarrito.set(itemsActuales.filter((item) => item.producto_id !== producto.id));
    } else {
      // Si lo tildó, lo agregamos automáticamente con cantidad 1
      this.itemsCarrito.set([
        ...itemsActuales,
        {
          producto_id: producto.id,
          codigo: producto.codigo,
          nombre: producto.nombre,
          cantidad: 1, // Adri luego puede cambiar este 1 por un 5 en la tabla de abajo
          stock_maximo: producto.stock_disponible,
          precio: producto.precio,
        },
      ]);
    }
  }

  imprimirVistaActual() {
    const tipo = this.vistaDetalleActual() === 'entrega' ? 'remito' : 'ticket';

    Swal.fire({
      title: 'Generando PDF...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    setTimeout(() => {
      const elementId = tipo === 'remito' ? 'zona-impresion' : 'ticket-liquidacion';
      const element = document.getElementById(elementId);

      if (element) {
        html2canvas(element, { scale: 2 }).then((canvas) => {
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF('p', 'mm', 'a4');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

          const nombreArchivo =
            tipo === 'remito'
              ? `Remito_${this.remitoEnDetalle().id}_${this.remitoEnDetalle().vendedor}.pdf`
              : `Liquidacion_${this.remitoEnDetalle().id}_${this.remitoEnDetalle().vendedor}.pdf`;

          pdf.save(nombreArchivo);
          Swal.close();
        });
      }
    }, 800);
  }

  // ==========================================
  // FUNCIONES DE LIQUIDACIÓN
  // ==========================================

  // 1. Abre la ventanita cuando hacemos clic en "Cerrar Remito"
  abrirModalLiquidacion(remito: any) {
    this.remitoLiquidacion.set(remito);
    console.log('Remito para liquidar:', remito);
    // Le pedimos al backend los items reales de ESTE remito
    this.remitoService.getRemitoItems(remito.id).subscribe({
      next: (itemsBackend) => {
        // Clonamos los ítems que llegaron de la base de datos
        const itemsClonados = itemsBackend.map((item: any) => ({
          ...item,
          cantidad_entregada: item.cantidad_entregada || item.cantidad,
          cantidad_vendida: 0,
          cantidad_devuelta: item.cantidad_entregada || item.cantidad,
        }));

        this.itemsLiquidacion.set(itemsClonados);
        this.comisionPorcentaje = 25;
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

  // 2. Hace la magia: Si cambia lo vendido, ajusta lo devuelto (y viceversa)
  actualizarCantidades(index: number, tipo: 'vendida' | 'devuelta') {
    const items = this.itemsLiquidacion();
    const item = items[index];
    const totalEntregado = item.cantidad_entregada;

    // Evitamos números locos
    if (!item.cantidad_vendida || item.cantidad_vendida < 0) item.cantidad_vendida = 0;
    if (!item.cantidad_devuelta || item.cantidad_devuelta < 0) item.cantidad_devuelta = 0;

    if (tipo === 'vendida') {
      if (item.cantidad_vendida > totalEntregado) item.cantidad_vendida = totalEntregado;
      item.cantidad_devuelta = totalEntregado - item.cantidad_vendida;
    } else {
      if (item.cantidad_devuelta > totalEntregado) item.cantidad_devuelta = totalEntregado;
      item.cantidad_vendida = totalEntregado - item.cantidad_devuelta;
    }

    this.calcularTotalNeto();
  }

  // 3. Calcula cuánta plata le queda a Adri sacando la comisión
  calcularTotalNeto() {
    const items = this.itemsLiquidacion();
    let suma = 0;

    items.forEach((item) => {
      if (item.cantidad_vendida > 0) {
        // Le restamos el porcentaje al precio original
        const descuento = item.precio * (this.comisionPorcentaje / 100);
        const precioConComision = item.precio - descuento;

        suma += precioConComision * item.cantidad_vendida;
      }
    });

    this.totalNeto.set(suma);
  }

  // 4. Confirma el cierre, avisa al backend e imprime el ticket
  confirmarCierreYTicket() {
    const remito = this.remitoLiquidacion();
    if (!remito) return;

    const datosCierre = {
      items: this.itemsLiquidacion(),
      comision: this.comisionPorcentaje, // Le mandamos la comisión a la base
    };

    Swal.fire({
      title: 'Liquidando...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    this.remitoService.cerrarRemito(remito.id, datosCierre).subscribe({
      next: () => {
        Swal.fire(
          '¡Liquidación Guardada!',
          'Ahora podés imprimir el ticket desde el botón "Ver" en el historial.',
          'success',
        );
        this.cerrarModalLiquidacion();
        this.cargarHistorialRemitos();
        this.cargarDatosBase();
      },
      error: () => Swal.fire('Error', 'Hubo un problema al liquidar.', 'error'),
    });
  }
}
