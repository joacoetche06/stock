import { Component, signal, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VendedorService, Vendedor } from '../../services/vendedor.service';
import Swal from 'sweetalert2';

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
      Swal.fire({
        icon: 'warning',
        title: 'Faltan datos',
        text: 'El nombre de la vendedora es obligatorio.',
        confirmButtonColor: '#B87366',
      });
      return;
    }

    // MODO EDICIÓN
    if (this.editandoId()) {
      this.vendedorService.editarVendedor(this.editandoId()!, this.nuevoVendedor).subscribe({
        next: () => {
          Swal.fire({
            icon: 'success',
            title: '¡Actualizada!',
            text: 'Los datos se modificaron correctamente.',
            timer: 1500,
            showConfirmButton: false,
          });
          this.cargarVendedores();
          this.limpiarFormulario();
        },
        error: (err) => Swal.fire('Error', 'No se pudo editar la vendedora', 'error'),
      });
    }
    // MODO CREACIÓN
    else {
      this.vendedorService.crearVendedor(this.nuevoVendedor).subscribe({
        next: () => {
          Swal.fire({
            icon: 'success',
            title: '¡Guardada!',
            text: 'La nueva vendedora fue agregada al sistema.',
            confirmButtonColor: '#B87366',
          });
          this.cargarVendedores();
          this.limpiarFormulario();
        },
        error: (err) => Swal.fire('Error', 'No se pudo crear la vendedora', 'error'),
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
    Swal.fire({
      title: '¿Estás seguro?',
      text: 'Se eliminará a esta vendedora del sistema.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (result.isConfirmed) {
        this.vendedorService.eliminarVendedor(id).subscribe({
          next: () => {
            Swal.fire('Eliminada', 'La vendedora fue borrada con éxito.', 'success');
            this.cargarVendedores();
            if (this.editandoId() === id) this.limpiarFormulario();
          },
          error: () =>
            Swal.fire({
              icon: 'error',
              title: 'No se puede eliminar',
              text: 'Esta vendedora ya tiene remitos asociados en el sistema. (No podés borrar el historial contable).',
              confirmButtonColor: '#B87366',
            }),
        });
      }
    });
  }
}
