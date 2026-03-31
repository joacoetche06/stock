import { Component, signal, afterNextRender, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductoService, Producto } from '../../services/producto.service';

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

  // (Asegurate de hacer lo mismo dentro de tu función limpiarFormulario())

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
    // 1. Validamos que no intente guardar un producto en blanco
    if (!this.nuevoProducto.nombre || !this.nuevoProducto.categoria) {
      alert('Por favor elegí la categoría y escribí la descripción de la joya.');
      return; // Cortamos la ejecución acá para que no rompa el backend
    }

    // Modo EDICIÓN
    if (this.editandoId()) {
      this.productoService.editarProducto(this.editandoId()!, this.nuevoProducto).subscribe({
        next: () => {
          this.cargarProductos();
          this.limpiarFormulario();
        },
        error: (err) => {
          console.error(err);
          alert('Error al actualizar el producto.');
        },
      });
    }
    // Modo CREACIÓN
    else {
      this.nuevoProducto.stock_disponible = this.nuevoProducto.stock_real;
      this.productoService.crearProducto(this.nuevoProducto).subscribe({
        next: (respuestaDelBackend: any) => {
          // 🎉 Cartel de éxito dinámico con el nuevo código
          alert(`¡Guardado exitoso! Se generó el código: ${respuestaDelBackend.codigo}`);
          this.cargarProductos();
          this.limpiarFormulario();
        },
        error: (err) => {
          console.error(err);
          alert('Hubo un error en el servidor. Revisá la terminal negra de Node.js');
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
      return alert('Por favor, ingresá un porcentaje de aumento válido (mayor a 0).');
    }

    if (
      confirm(
        `¿Estás seguro de aplicar un aumento del ${porcentaje}% a las ${ids.length} joyas seleccionadas?`,
      )
    ) {
      this.productoService.aumentoMasivo(ids, porcentaje).subscribe({
        next: () => {
          alert('✅ Precios actualizados masivamente con éxito.');
          this.productosSeleccionados.set(new Set()); // Limpiamos las cajitas
          this.porcentajeAumento.set(null); // Limpiamos el input
          this.cargarProductos(); // Refrescamos los nuevos precios
        },
        error: () => alert('Hubo un error al actualizar los precios.'),
      });
    }
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
    if (confirm('¿Estás seguro de que querés eliminar este producto?')) {
      this.productoService.eliminarProducto(id).subscribe({
        next: () => {
          this.cargarProductos();
          if (this.editandoId() === id) this.limpiarFormulario();
        },
        error: () =>
          alert('No se puede eliminar este producto porque ya está incluido en algún remito.'),
      });
    }
  }
}
