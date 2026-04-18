import { Component, signal, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VendedorService, Vendedor } from '../../services/vendedor.service';
import { ConfigService } from '../../services/config.service';
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
  editandoId = signal<number | null>(null);
  nuevoVendedor: Vendedor = { nombre: '', telefono: '' };

  get nombreVendedor() { return this.configService.nombreVendedor; }
  get nombreVendedorPlural() { return this.configService.nombreVendedorPlural; }
  get colorPrincipal() { return this.configService.config()?.negocio.colorPrincipal; }

  constructor(
    private vendedorService: VendedorService,
    public configService: ConfigService,
  ) {
    afterNextRender(() => this.cargarVendedores());
  }

  cargarVendedores() {
    this.vendedorService.getVendedores().subscribe({
      next: (data) => this.vendedores.set(data),
      error: (err) => console.error('Error al cargar vendedores', err),
    });
  }

  guardarVendedor() {
    if (!this.nuevoVendedor.nombre) {
      Swal.fire({ icon: 'warning', title: 'Faltan datos', text: `El nombre del ${this.nombreVendedor} es obligatorio.`, confirmButtonColor: this.colorPrincipal });
      return;
    }

    if (this.editandoId()) {
      this.vendedorService.editarVendedor(this.editandoId()!, this.nuevoVendedor).subscribe({
        next: () => {
          Swal.fire({ icon: 'success', title: '¡Actualizado!', text: 'Los datos se modificaron correctamente.', timer: 1500, showConfirmButton: false });
          this.cargarVendedores();
          this.limpiarFormulario();
        },
        error: () => Swal.fire('Error', `No se pudo editar el ${this.nombreVendedor}`, 'error'),
      });
    } else {
      this.vendedorService.crearVendedor(this.nuevoVendedor).subscribe({
        next: () => {
          Swal.fire({ icon: 'success', title: '¡Guardado!', text: `El ${this.nombreVendedor} fue agregado al sistema.`, confirmButtonColor: this.colorPrincipal });
          this.cargarVendedores();
          this.limpiarFormulario();
        },
        error: () => Swal.fire('Error', `No se pudo crear el ${this.nombreVendedor}`, 'error'),
      });
    }
  }

  editar(vend: Vendedor) {
    this.editandoId.set(vend.id!);
    this.nuevoVendedor = { ...vend };
    window.scrollTo(0, 0);
  }

  limpiarFormulario() {
    this.editandoId.set(null);
    this.nuevoVendedor = { nombre: '', telefono: '' };
  }

  eliminar(id: number) {
    Swal.fire({
      title: '¿Estás seguro?', text: `Se eliminará este ${this.nombreVendedor} del sistema.`, icon: 'warning',
      showCancelButton: true, confirmButtonColor: '#dc3545', cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (result.isConfirmed) {
        this.vendedorService.eliminarVendedor(id).subscribe({
          next: () => { Swal.fire('Eliminado', `El ${this.nombreVendedor} fue borrado con éxito.`, 'success'); this.cargarVendedores(); if (this.editandoId() === id) this.limpiarFormulario(); },
          error: () => Swal.fire({ icon: 'error', title: 'No se puede eliminar', text: `Este ${this.nombreVendedor} ya tiene remitos asociados en el sistema.`, confirmButtonColor: this.colorPrincipal }),
        });
      }
    });
  }
}
