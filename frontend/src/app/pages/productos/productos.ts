import { Component, signal, afterNextRender, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductoService, Producto } from '../../services/producto.service';
import { ConfigService } from '../../services/config.service';
import Swal from 'sweetalert2';
import jsPDF from 'jspdf';

@Component({
  selector: 'app-productos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './productos.html',
  styleUrl: './productos.css',
})
export class ProductosComponent {
  productos = signal<Producto[]>([]);
  filtroTexto = signal<string>('');
  filtroCategoria = signal<string>('');
  filtroMaterial = signal<string>('');
  columnaOrden = signal<string>('nombre');
  ordenAscendente = signal<boolean>(true);
  editandoId = signal<number | null>(null);
  dropdownAbierto = signal<string>('');
  productosSeleccionados = signal<Set<number>>(new Set());
  porcentajeAumento = signal<number | null>(null);

  nuevoProducto: Producto = this.productoVacio();

  // Getters de conveniencia para el template
  get categorias() { return this.configService.categorias; }
  get materiales()  { return this.configService.materiales; }
  get medidas()     { return this.configService.medidas; }
  get usaMedida()   { return this.configService.usaMedida; }
  get categoriaConMedida() { return this.configService.categoriaConMedida; }
  get nombreProducto() { return this.configService.nombreProducto; }
  get nombreProductoPlural() { return this.configService.nombreProductoPlural; }

  constructor(
    private productoService: ProductoService,
    public configService: ConfigService,
  ) {
    afterNextRender(() => this.cargarProductos());
  }

  private productoVacio(): Producto {
    return { categoria: '', material: '', medida: '', nombre: '', precio: 0, stock_real: 0, stock_disponible: 0 };
  }

  cambiarOrden(columna: string) {
    if (this.columnaOrden() === columna) {
      this.ordenAscendente.set(!this.ordenAscendente());
    } else {
      this.columnaOrden.set(columna);
      this.ordenAscendente.set(true);
    }
  }

  productosFiltrados = computed(() => {
    const texto = this.filtroTexto().toLowerCase();
    const categoria = this.filtroCategoria();
    const material = this.filtroMaterial();
    const col = this.columnaOrden();
    const asc = this.ordenAscendente() ? 1 : -1;

    let filtrados = this.productos().filter((p) => {
      if (categoria && p.categoria !== categoria) return false;
      if (material && p.material !== material) return false;
      if (texto) {
        const nombreMatch = p.nombre.toLowerCase().includes(texto);
        const codigoMatch = (p.codigo || '').toLowerCase().includes(texto);
        if (!nombreMatch && !codigoMatch) return false;
      }
      return true;
    });

    return filtrados.sort((a: any, b: any) => {
      if (a.stock_disponible <= 0 && b.stock_disponible > 0) return 1;
      if (b.stock_disponible <= 0 && a.stock_disponible > 0) return -1;
      let valA = a[col] || '';
      let valB = b[col] || '';
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return -1 * asc;
      if (valA > valB) return 1 * asc;
      return 0;
    });
  });

  @HostListener('document:click')
  cerrarDropdowns() { this.dropdownAbierto.set(''); }

  toggleDropdown(menu: string, event: Event) {
    event.stopPropagation();
    this.dropdownAbierto.set(this.dropdownAbierto() === menu ? '' : menu);
  }

  setCategoriaForm(cat: string) {
    this.nuevoProducto.categoria = cat;
    if (cat !== this.categoriaConMedida) this.nuevoProducto.medida = '';
    this.dropdownAbierto.set('');
  }

  setMedidaForm(med: string) {
    this.nuevoProducto.medida = med;
    this.dropdownAbierto.set('');
  }

  setMaterialForm(mat: string) {
    this.nuevoProducto.material = mat;
    this.dropdownAbierto.set('');
  }

  setCategoriaFiltro(cat: string) {
    this.filtroCategoria.set(cat);
    this.dropdownAbierto.set('');
  }

  setMaterialFiltro(mat: string) {
    this.filtroMaterial.set(mat);
    this.dropdownAbierto.set('');
  }

  cargarProductos() {
    this.productoService.getProductos().subscribe({
      next: (data) => this.productos.set(data),
      error: (err) => console.error('Error al cargar productos', err),
    });
  }

  guardarProducto() {
    const np = this.configService.nombreProducto;

    if (!this.nuevoProducto.categoria) {
      return Swal.fire({ icon: 'warning', title: 'Falta la Categoría', text: `Seleccioná qué tipo de ${np} es.`, confirmButtonColor: this.configService.config()?.negocio.colorPrincipal });
    }

    if (this.usaMedida && this.nuevoProducto.categoria === this.categoriaConMedida && !this.nuevoProducto.medida) {
      return Swal.fire({ icon: 'warning', title: 'Falta la Medida', text: `Como elegiste "${this.categoriaConMedida}", seleccioná la medida.`, confirmButtonColor: this.configService.config()?.negocio.colorPrincipal });
    }

    if (!this.nuevoProducto.material) {
      return Swal.fire({ icon: 'warning', title: 'Falta el Material', text: `Seleccioná el material del ${np}.`, confirmButtonColor: this.configService.config()?.negocio.colorPrincipal });
    }

    if (this.nuevoProducto.precio == null || this.nuevoProducto.precio < 0) {
      return Swal.fire({ icon: 'warning', title: 'Falta el Precio', text: 'Ingresá un precio válido.', confirmButtonColor: this.configService.config()?.negocio.colorPrincipal });
    }

    if (this.nuevoProducto.stock_real == null || this.nuevoProducto.stock_real < 0) {
      return Swal.fire({ icon: 'warning', title: 'Falta el Stock', text: 'Ingresá la cantidad de unidades.', confirmButtonColor: this.configService.config()?.negocio.colorPrincipal });
    }

    if (this.editandoId()) {
      this.productoService.editarProducto(this.editandoId()!, this.nuevoProducto).subscribe({
        next: () => {
          Swal.fire({ icon: 'success', title: '¡Actualizado!', timer: 1500, showConfirmButton: false });
          this.cargarProductos();
          this.limpiarFormulario();
        },
        error: () => Swal.fire('Error', `Error al actualizar el ${np}.`, 'error'),
      });
    } else {
      this.nuevoProducto.stock_disponible = this.nuevoProducto.stock_real;
      this.productoService.crearProducto(this.nuevoProducto).subscribe({
        next: (respuesta: any) => {
          Swal.fire({ icon: 'success', title: '¡Guardado!', html: `Código generado: <b>${respuesta.codigo}</b>`, confirmButtonColor: this.configService.config()?.negocio.colorPrincipal });
          this.cargarProductos();
          this.limpiarFormulario();
        },
        error: () => Swal.fire('Error', 'Hubo un error en el servidor.', 'error'),
      });
    }
    return;
  }

  importarCSV(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => this.procesarCSV(e.target?.result as string);
    reader.readAsText(file);
    event.target.value = '';
  }

  procesarCSV(texto: string) {
    const separador = texto.includes(';') ? ';' : ',';
    const lineas = texto.split('\n').filter((l) => l.trim() !== '');
    const productosNuevos = [];

    // Normalización: intentamos mapear los nombres del CSV a los de la config
    const nombresCats = this.categorias.map((c) => c.nombre);

    for (let i = 1; i < lineas.length; i++) {
      const cols = lineas[i].split(separador).map((c) => c.trim().replace(/^"|"$/g, ''));
      if (cols.length >= 5) {
        // Buscamos la categoría más parecida en la config
        const catRaw = cols[0].charAt(0).toUpperCase() + cols[0].slice(1).toLowerCase();
        const catMatch = nombresCats.find(
          (n) => n.toLowerCase() === catRaw.toLowerCase() || n.toLowerCase().startsWith(catRaw.toLowerCase())
        ) || catRaw;

        productosNuevos.push({
          categoria: catMatch,
          material: cols[1].charAt(0).toUpperCase() + cols[1].slice(1).toLowerCase(),
          medida: cols[2] === '-' || cols[2].toLowerCase() === 'no' ? '' : cols[2],
          nombre: cols[3],
          precio: Number(cols[4]),
          stock: Number(cols[5] || 1),
        });
      }
    }

    if (productosNuevos.length === 0) {
      return Swal.fire('Error', 'El archivo está vacío o no tiene el formato correcto.', 'error');
    }

    Swal.fire({ title: 'Importando...', text: `Procesando ${productosNuevos.length} productos.`, allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    this.productoService.crearProductosMasivo(productosNuevos).subscribe({
      next: (res: any) => { Swal.fire('¡Importados!', res.mensaje, 'success'); this.cargarProductos(); },
      error: () => Swal.fire('Error', 'Hubo un problema al cargar el archivo.', 'error'),
    });
    return;
  }

  toggleSeleccion(id: number) {
    const s = new Set(this.productosSeleccionados());
    s.has(id) ? s.delete(id) : s.add(id);
    this.productosSeleccionados.set(s);
  }

  toggleSeleccionarTodos(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.productosSeleccionados.set(checked ? new Set(this.productosFiltrados().map((p) => p.id!)) : new Set());
  }

  todosEstanSeleccionados(): boolean {
    const f = this.productosFiltrados();
    return f.length > 0 && f.every((p) => this.productosSeleccionados().has(p.id!));
  }

  aplicarAumentoMasivo() {
    const porcentaje = this.porcentajeAumento();
    const ids = Array.from(this.productosSeleccionados());
    if (!porcentaje || porcentaje <= 0) {
      return Swal.fire('Atención', 'Ingresá un porcentaje válido (mayor a 0).', 'warning');
    }
    Swal.fire({
      title: '¿Aplicar aumento?',
      text: `Se aumentará un ${porcentaje}% el precio de ${ids.length} ${this.nombreProductoPlural}.`,
      icon: 'question', showCancelButton: true,
      confirmButtonColor: this.configService.config()?.negocio.colorPrincipal,
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, aplicar', cancelButtonText: 'Cancelar',
    }).then((r) => {
      if (r.isConfirmed) {
        this.productoService.aumentoMasivo(ids, porcentaje).subscribe({
          next: () => { Swal.fire('¡Listo!', 'Precios actualizados.', 'success'); this.productosSeleccionados.set(new Set()); this.porcentajeAumento.set(null); this.cargarProductos(); },
          error: () => Swal.fire('Error', 'Hubo un problema al actualizar precios.', 'error'),
        });
      }
    });
    return;
  }

  editar(prod: Producto) {
    this.editandoId.set(prod.id!);
    this.nuevoProducto = { ...prod };
    window.scrollTo(0, 0);
  }

  limpiarFormulario() {
    this.editandoId.set(null);
    this.nuevoProducto = this.productoVacio();
  }

  eliminar(id: number) {
    Swal.fire({
      title: '¿Estás seguro?', text: 'No podrás revertir esto.', icon: 'warning',
      showCancelButton: true, confirmButtonColor: '#dc3545', cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar',
    }).then((r) => {
      if (r.isConfirmed) {
        this.productoService.eliminarProducto(id).subscribe({
          next: () => { Swal.fire('Eliminado', `El ${this.nombreProducto} fue eliminado.`, 'success'); this.cargarProductos(); if (this.editandoId() === id) this.limpiarFormulario(); },
          error: () => Swal.fire('No se puede', `Este ${this.nombreProducto} ya está en algún remito.`, 'error'),
        });
      }
    });
  }

  descargarListaPrecios(): void {
    const lista = this.productos().filter((p) => p.stock_real > 0);
    if (lista.length === 0) { Swal.fire('Lista vacía', 'No hay productos con stock mayor a cero.', 'info'); return; }

    const doc = new jsPDF();
    const fecha = new Date().toLocaleDateString();
    const negocio = this.configService.nombreNegocio;

    doc.setFontSize(18);
    doc.text(`Lista de Precios - ${negocio}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Fecha: ${fecha}`, 14, 28);

    let y = 40;
    doc.setFont('helvetica', 'bold');
    doc.text('Código', 14, y); doc.text('Descripción', 40, y); doc.text('Material', 120, y); doc.text('Precio', 170, y);
    doc.line(14, y + 2, 195, y + 2);
    y += 10;

    doc.setFont('helvetica', 'normal');
    lista.forEach((p) => {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(p.codigo ? String(p.codigo) : '-', 14, y);
      doc.text(p.nombre ? String(p.nombre).substring(0, 40) : '-', 40, y);
      doc.text(p.material ? String(p.material) : '-', 120, y);
      doc.text(p.precio !== undefined ? `$${p.precio.toLocaleString()}` : '-', 170, y);
      y += 8;
    });

    doc.save(`Lista_Precios_${fecha.replace(/\//g, '-')}.pdf`);
    Swal.fire('¡Éxito!', 'Lista de precios descargada.', 'success');
  }

  async agregarMaterial() {
    const { value: nuevoMaterial } = await Swal.fire({
      title: 'Nuevo Material',
      input: 'text',
      inputPlaceholder: 'Ej: Acero dorado',
      showCancelButton: true,
      confirmButtonText: 'Agregar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: this.configService.config()?.negocio.colorPrincipal
    });

    if (nuevoMaterial) {
      const configActual = this.configService.config();
      if (configActual) {
        // Clonamos la config para no mutarla directamente
        const nuevaConfig = JSON.parse(JSON.stringify(configActual));
        
        // Evitamos duplicados (ignorando mayúsculas/minúsculas)
        const existe = nuevaConfig.inventario.materiales.find((m: string) => m.toLowerCase() === nuevoMaterial.toLowerCase());
        if (existe) return Swal.fire('Error', 'Ese material ya existe.', 'error');
        
        nuevaConfig.inventario.materiales.push(nuevoMaterial);
        
        this.configService.actualizarConfig(nuevaConfig).subscribe({
          next: () => {
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Guardado correctamente', showConfirmButton: false, timer: 2000 });
          },
          error: () => {
            Swal.fire('Error', 'Hubo un problema al intentar guardar.', 'error');
          }
        });
      }
    }

    return;
  }

  async agregarCategoria() {
    const { value: formValues } = await Swal.fire({
      title: 'Nueva Categoría',
      html:
        '<input id="swal-cat-nombre" class="swal2-input" placeholder="Nombre (Ej: Tobilleras)">' +
        '<input id="swal-cat-prefijo" class="swal2-input" placeholder="Prefijo (Ej: TO)" maxlength="3" style="text-transform: uppercase;">',
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Agregar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: this.configService.config()?.negocio.colorPrincipal,
      preConfirm: () => {
        const nombre = (document.getElementById('swal-cat-nombre') as HTMLInputElement).value.trim();
        const prefijo = (document.getElementById('swal-cat-prefijo') as HTMLInputElement).value.trim().toUpperCase();
        if (!nombre || !prefijo) {
          Swal.showValidationMessage('Ambos campos son obligatorios');
          return null;
        }
        return { nombre, prefijo };
      }
    });

    if (formValues) {
      const configActual = this.configService.config();
      if (configActual) {
        const nuevaConfig = JSON.parse(JSON.stringify(configActual));
        
        // Evitamos duplicados
        const existe = nuevaConfig.inventario.categorias.find((c: any) => c.nombre.toLowerCase() === formValues.nombre.toLowerCase() || c.prefijo === formValues.prefijo);
        if (existe) return Swal.fire('Error', 'Ya existe una categoría con ese nombre o prefijo.', 'error');
        
        nuevaConfig.inventario.categorias.push(formValues);
        
        this.configService.actualizarConfig(nuevaConfig).subscribe({
          next: () => {
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Guardado correctamente', showConfirmButton: false, timer: 2000 });
          },
          error: () => {
            Swal.fire('Error', 'Hubo un problema al intentar guardar.', 'error');
          }
        });
      }
    }
    return;
  }

  async agregarMedida() {
    const { value: nuevaMedida } = await Swal.fire({
      title: 'Nueva Medida',
      input: 'text',
      inputPlaceholder: 'Ej: 65 cm',
      showCancelButton: true,
      confirmButtonText: 'Agregar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: this.configService.config()?.negocio.colorPrincipal
    });

    if (nuevaMedida) {
      const configActual = this.configService.config();
      if (configActual) {
        const nuevaConfig = JSON.parse(JSON.stringify(configActual));
        
        // Evitamos duplicados
        const existe = nuevaConfig.inventario.medidas.find((m: string) => m.toLowerCase() === nuevaMedida.toLowerCase());
        if (existe) return Swal.fire('Error', 'Esa medida ya existe.', 'error');
        
        nuevaConfig.inventario.medidas.push(nuevaMedida);
        
        this.configService.actualizarConfig(nuevaConfig).subscribe({
          next: () => {
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Guardado correctamente', showConfirmButton: false, timer: 2000 });
          },
          error: () => {
            Swal.fire('Error', 'Hubo un problema al intentar guardar.', 'error');
          }
        });
      }
    }

    return;
  }

}
