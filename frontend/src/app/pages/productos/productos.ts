import { Component, signal, afterNextRender, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductoService, Producto } from '../../services/producto.service';
import Swal from 'sweetalert2';
@Component({
  selector: 'app-productos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './productos.html',
  styleUrl: './productos.css',
})
export class ProductosComponent {
  productos = signal<Producto[]>([]);
  // --- NUEVO: Variables para los Filtros ---
  filtroTexto = signal<string>('');
  filtroCategoria = signal<string>('');
  filtroMaterial = signal<string>('');

  // Magia de Angular: Filtra la tabla en tiempo real
  productosFiltrados = computed(() => {
    const texto = this.filtroTexto().toLowerCase();
    const categoria = this.filtroCategoria();
    const material = this.filtroMaterial();

    return this.productos().filter((p) => {
      // 1. Filtro por Categoría (Si eligió una y no coincide, lo ocultamos)
      if (categoria && p.categoria !== categoria) return false;

      // 2. Filtro por Material
      if (material && p.material !== material) return false;

      // 3. Filtro por Texto (Busca en el nombre o en el código)
      if (texto) {
        const nombreMatch = p.nombre.toLowerCase().includes(texto);
        const codigoMatch = (p.codigo || '').toLowerCase().includes(texto);
        if (!nombreMatch && !codigoMatch) return false;
      }

      return true; // Si pasó todos los filtros, se muestra
    });
  });
  // Variable para saber si estamos editando (guarda el ID) o creando (queda en null)
  editandoId = signal<number | null>(null);

  nuevoProducto: Producto = {
    categoria: '',
    material: '',
    medida: '', // <-- NUEVO
    nombre: '',
    precio: 0,
    stock_real: 0,
    stock_disponible: 0,
  };

  // --- CONTROL DE MENÚS DESPLEGABLES CUSTOM ---
  dropdownAbierto = signal<string>(''); // Guarda el nombre del menú que está abierto

  // Este HostListener escucha los clics en toda la página.
  // Si hacés clic afuera de un menú, los cierra todos.
  @HostListener('document:click')
  cerrarDropdowns() {
    this.dropdownAbierto.set('');
  }

  // Abre o cierra un menú específico
  toggleDropdown(menu: string, event: Event) {
    event.stopPropagation(); // Evita que el clic llegue al document y lo cierre al instante
    this.dropdownAbierto.set(this.dropdownAbierto() === menu ? '' : menu);
  }

  // --- SETTERS PARA EL FORMULARIO ---
  setCategoriaForm(cat: string) {
    this.nuevoProducto.categoria = cat;
    if (cat !== 'Cadenas') this.nuevoProducto.medida = ''; // Limpiamos medida si no es cadena
    this.dropdownAbierto.set(''); // Cerramos menú
  }

  setMedidaForm(med: string) {
    this.nuevoProducto.medida = med;
    this.dropdownAbierto.set('');
  }

  setMaterialForm(mat: string) {
    this.nuevoProducto.material = mat;
    this.dropdownAbierto.set('');
  }

  // --- SETTERS PARA LOS FILTROS DE BÚSQUEDA ---
  setCategoriaFiltro(cat: string) {
    this.filtroCategoria.set(cat);
    this.dropdownAbierto.set('');
  }

  setMaterialFiltro(mat: string) {
    this.filtroMaterial.set(mat);
    this.dropdownAbierto.set('');
  }

  constructor(private productoService: ProductoService) {
    afterNextRender(() => {
      this.cargarProductos();
    });
  }

  cargarProductos() {
    this.productoService.getProductos().subscribe({
      next: (data) => this.productos.set(data),
      error: (err) => console.error('Error al cargar productos', err),
    });
  }

  guardarProducto() {
    // 1. Validaciones obligatorias (Todo menos el nombre/descripción)

    if (!this.nuevoProducto.categoria) {
      Swal.fire({
        icon: 'warning',
        title: 'Falta la Categoría',
        text: 'Por favor seleccioná qué tipo de joya es (Cadena, Anillo, etc.).',
        confirmButtonColor: '#B87366',
      });
      return;
    }

    // Validación especial: Si es cadena, obligamos a que tenga medida
    if (this.nuevoProducto.categoria === 'Cadenas' && !this.nuevoProducto.medida) {
      Swal.fire({
        icon: 'warning',
        title: 'Falta la Medida',
        text: 'Como elegiste "Cadenas", por favor seleccioná de cuántos cm es.',
        confirmButtonColor: '#B87366',
      });
      return;
    }

    if (!this.nuevoProducto.material) {
      Swal.fire({
        icon: 'warning',
        title: 'Falta el Material',
        text: 'Por favor seleccioná de qué material está hecha la joya.',
        confirmButtonColor: '#B87366',
      });
      return;
    }

    // Validamos que precio y stock no estén vacíos y no sean negativos
    if (
      this.nuevoProducto.precio === null ||
      this.nuevoProducto.precio === undefined ||
      this.nuevoProducto.precio < 0
    ) {
      Swal.fire({
        icon: 'warning',
        title: 'Falta el Precio',
        text: 'Por favor ingresá un precio válido (mayor o igual a cero).',
        confirmButtonColor: '#B87366',
      });
      return;
    }

    if (
      this.nuevoProducto.stock_real === null ||
      this.nuevoProducto.stock_real === undefined ||
      this.nuevoProducto.stock_real < 0
    ) {
      Swal.fire({
        icon: 'warning',
        title: 'Falta el Stock',
        text: 'Por favor ingresá la cantidad de unidades que tenés de esta joya.',
        confirmButtonColor: '#B87366',
      });
      return;
    }

    // Modo EDICIÓN
    if (this.editandoId()) {
      this.productoService.editarProducto(this.editandoId()!, this.nuevoProducto).subscribe({
        next: () => {
          Swal.fire({
            icon: 'success',
            title: '¡Actualizado!',
            text: 'El producto se modificó correctamente.',
            timer: 1500,
            showConfirmButton: false,
          });
          this.cargarProductos();
          this.limpiarFormulario();
        },
        error: (err) => {
          console.error(err);
          Swal.fire('Error', 'Error al actualizar el producto.', 'error');
        },
      });
    }
    // Modo CREACIÓN
    else {
      this.nuevoProducto.stock_disponible = this.nuevoProducto.stock_real;
      this.productoService.crearProducto(this.nuevoProducto).subscribe({
        next: (respuesta: any) => {
          Swal.fire({
            icon: 'success',
            title: '¡Guardado exitoso!',
            html: `Se generó el código: <b>${respuesta.codigo}</b>`,
            confirmButtonColor: '#B87366',
          });
          this.cargarProductos();
          this.limpiarFormulario();
        },
        error: (err) => {
          console.error(err);
          Swal.fire('Error', 'Hubo un error en el servidor.', 'error');
        },
      });
    }
  }
  // --- NUEVO: Selección y Aumento Masivo ---
  productosSeleccionados = signal<Set<number>>(new Set());
  porcentajeAumento = signal<number | null>(null);

  // Selecciona o deselecciona un producto individual
  toggleSeleccion(id: number) {
    const seleccion = new Set(this.productosSeleccionados());
    if (seleccion.has(id)) {
      seleccion.delete(id);
    } else {
      seleccion.add(id);
    }
    this.productosSeleccionados.set(seleccion);
  }

  // Tilda o destilda TODOS los productos que se estén viendo en la tabla (filtrados)
  toggleSeleccionarTodos(event: Event) {
    const estaTildado = (event.target as HTMLInputElement).checked;
    if (estaTildado) {
      const todosLosIds = this.productosFiltrados().map((p) => p.id!);
      this.productosSeleccionados.set(new Set(todosLosIds));
    } else {
      this.productosSeleccionados.set(new Set()); // Vacía la selección
    }
  }

  // Comprueba si todos los visibles están seleccionados (para marcar el checkbox de la cabecera)
  todosEstanSeleccionados(): boolean {
    const filtrados = this.productosFiltrados();
    if (filtrados.length === 0) return false;
    return filtrados.every((p) => this.productosSeleccionados().has(p.id!));
  }

  aplicarAumentoMasivo() {
    const porcentaje = this.porcentajeAumento();
    const ids = Array.from(this.productosSeleccionados());

    if (!porcentaje || porcentaje <= 0) {
      // Mostrar el cartel y luego cortar la ejecución (return vacío)
      Swal.fire('Atención', 'Ingresá un porcentaje de aumento válido (mayor a 0).', 'warning');
      return;
    }

    Swal.fire({
      title: '¿Aplicar aumento?',
      text: `Se aumentará un ${porcentaje}% el precio de ${ids.length} joyas.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#B87366',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, aplicar',
      cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (result.isConfirmed) {
        this.productoService.aumentoMasivo(ids, porcentaje).subscribe({
          next: () => {
            Swal.fire('¡Listo!', 'Precios actualizados masivamente.', 'success');
            this.productosSeleccionados.set(new Set());
            this.porcentajeAumento.set(null);
            this.cargarProductos();
          },
          error: () => Swal.fire('Error', 'Hubo un problema al actualizar precios.', 'error'),
        });
      }
    });
  }

  // Cuando hacemos clic en el botón "Editar" de la tabla
  editar(prod: Producto) {
    this.editandoId.set(prod.id!);
    this.nuevoProducto = { ...prod }; // Copiamos los datos al formulario de arriba
    window.scrollTo(0, 0); // Subimos la pantalla para que vea el formulario
  }

  limpiarFormulario() {
    this.editandoId.set(null);
    this.nuevoProducto = {
      categoria: '',
      material: '',
      medida: '', // <-- NUEVO
      nombre: '',
      precio: 0,
      stock_real: 0,
      stock_disponible: 0,
    };

    // (Asegurate de hacer lo mismo dentro de tu función limpiarFormulario())
  }

  eliminar(id: number) {
    Swal.fire({
      title: '¿Estás seguro?',
      text: 'No podrás revertir esto.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (result.isConfirmed) {
        this.productoService.eliminarProducto(id).subscribe({
          next: () => {
            Swal.fire('Eliminado', 'La joya fue eliminada del sistema.', 'success');
            this.cargarProductos();
            if (this.editandoId() === id) this.limpiarFormulario();
          },
          error: () =>
            Swal.fire('No se puede', 'Esta joya ya está incluida en algún remito.', 'error'),
        });
      }
    });
  }
}
