import { Component, signal, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VendedorService, Vendedor } from '../../services/vendedor.service';

@Component({
  selector: 'app-vendedores',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './vendedores.html',
  styleUrl: './vendedores.css',
})
export class VendedoresComponent {
  vendedores = signal<Vendedor[]>([]);

  // Variable para saber si estamos editando
  editandoId = signal<number | null>(null);

  nuevoVendedor: Vendedor = { nombre: '', telefono: '' };

  constructor(private vendedorService: VendedorService) {
    afterNextRender(() => {
      this.cargarVendedores();
    });
  }

  cargarVendedores() {
    this.vendedorService.getVendedores().subscribe({
      next: (data) => this.vendedores.set(data),
      error: (err) => console.error('Error al cargar vendedores', err),
    });
  }

  guardarVendedor() {
    if (!this.nuevoVendedor.nombre) {
      alert('El nombre del vendedor es obligatorio');
      return;
    }

    // MODO EDICIÓN
    if (this.editandoId()) {
      this.vendedorService.editarVendedor(this.editandoId()!, this.nuevoVendedor).subscribe({
        next: () => {
          this.cargarVendedores();
          this.limpiarFormulario();
        },
        error: (err) => console.error('Error al editar vendedor', err),
      });
    }
    // MODO CREACIÓN
    else {
      this.vendedorService.crearVendedor(this.nuevoVendedor).subscribe({
        next: () => {
          this.cargarVendedores();
          this.limpiarFormulario();
        },
        error: (err) => console.error('Error al crear vendedor', err),
      });
    }
  }

  editar(vend: Vendedor) {
    this.editandoId.set(vend.id!);
    this.nuevoVendedor = { ...vend }; // Copiamos los datos al formulario
    window.scrollTo(0, 0);
  }

  limpiarFormulario() {
    this.editandoId.set(null);
    this.nuevoVendedor = { nombre: '', telefono: '' };
  }

  eliminar(id: number) {
    if (confirm('¿Estás seguro de que querés eliminar esta vendedora?')) {
      this.vendedorService.eliminarVendedor(id).subscribe({
        next: () => {
          this.cargarVendedores();
          if (this.editandoId() === id) this.limpiarFormulario();
        },
        error: () =>
          alert(
            'No se puede eliminar esta vendedora porque ya tiene remitos asociados en el sistema.',
          ),
      });
    }
  }
}
