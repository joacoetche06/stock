import { Component, signal, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductoService } from '../../services/producto.service';

@Component({
  selector: 'app-etiquetas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './etiquetas.html',
  styleUrl: './etiquetas.css',
})
export class EtiquetasComponent {
  // (Verificá que el nombre de la clase sea este)
  productos = signal<any[]>([]);
  etiquetasAImprimir = signal<any[]>([]);

  constructor(private productoService: ProductoService) {
    afterNextRender(() => {
      this.cargarProductos();
    });
  }

  cargarProductos() {
    this.productoService.getProductos().subscribe({
      next: (data) => {
        // A cada producto le agregamos un contador en 0 para saber cuántas etiquetas quiere
        const prodsConContador = data.map((p) => ({ ...p, cantidad_etiquetas: 0 }));
        this.productos.set(prodsConContador);
      },
      error: (err) => console.error('Error al cargar productos', err),
    });
  }

  prepararImpresion() {
    const aImprimir = [];

    // Recorremos la lista y multiplicamos el producto por la cantidad solicitada
    for (const prod of this.productos()) {
      if (prod.cantidad_etiquetas > 0) {
        for (let i = 0; i < prod.cantidad_etiquetas; i++) {
          aImprimir.push(prod);
        }
      }
    }

    if (aImprimir.length === 0) {
      alert('Por favor, indicá una cantidad mayor a 0 en al menos un producto.');
      return;
    }

    this.etiquetasAImprimir.set(aImprimir);

    // Le damos a Angular 100 milisegundos para que dibuje las etiquetas ocultas antes de llamar a la impresora
    setTimeout(() => {
      window.print();
    }, 100);
  }
}
