import { Component, signal, afterNextRender } from '@angular/core';
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

  // Variable para saber si estamos editando (guarda el ID) o creando (queda en null)
  editandoId = signal<number | null>(null);

  nuevoProducto: Producto = {
    codigo: '',
    categoria: '',
    material: '',
    nombre: '',
    precio: 0,
    stock_real: 0,
    stock_disponible: 0,
  };

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
    // Modo EDICIÓN
    if (this.editandoId()) {
      this.productoService.editarProducto(this.editandoId()!, this.nuevoProducto).subscribe({
        next: () => {
          this.cargarProductos();
          this.limpiarFormulario();
        },
        error: (err) => {
          console.error(err);
          alert('Error al editar. ¿El código ya existe?');
        },
      });
    }
    // Modo CREACIÓN
    else {
      this.nuevoProducto.stock_disponible = this.nuevoProducto.stock_real;
      this.productoService.crearProducto(this.nuevoProducto).subscribe({
        next: () => {
          this.cargarProductos();
          this.limpiarFormulario();
        },
        error: (err) => {
          console.error(err);
          alert('Error al guardar. ¿Quizás ese código de producto ya existe?');
        },
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
      codigo: '',
      categoria: '',
      material: '',
      nombre: '',
      precio: 0,
      stock_real: 0,
      stock_disponible: 0,
    };
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
