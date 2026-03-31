import { Component, signal, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // <-- Importante para los inputs (ngModel)
import { ProductoService, Producto } from './services/producto.service';
import { RouterModule } from '@angular/router'; // <-- Clave para que funcione el menú
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule], // <-- Lo agregamos acá
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  // titulo = 'Control de Stock - Joyería Adri';

  // Convertimos "productos" en un Signal para que la vista se entere cuando cambia
  productos = signal<Producto[]>([]);

  // Creamos un objeto vacío para atar al formulario
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
      next: (data) => {
        this.productos.set(data); // <-- Con .set() le avisamos al HTML que hay datos nuevos
      },
      error: (err) => console.error('Error al cargar productos', err),
    });
  }

  crearProducto() {
    // Cuando creamos, el stock disponible es igual al real
    this.nuevoProducto.stock_disponible = this.nuevoProducto.stock_real;

    this.productoService.crearProducto(this.nuevoProducto).subscribe({
      next: () => {
        this.cargarProductos(); // Refrescamos la tabla
        // Limpiamos el formulario para cargar el siguiente
        this.nuevoProducto = {
          codigo: '',
          nombre: '',
          precio: 0,
          stock_real: 0,
          stock_disponible: 0,
        };
      },
      error: (err) => {
        console.error(err);
        alert('Error al guardar. ¿Quizás ese código de producto ya existe?');
      },
    });
  }
}
