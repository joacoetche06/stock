import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// Estructura de un Vendedor
export interface Vendedor {
  id?: number;
  nombre: string;
  telefono: string;
}

@Injectable({
  providedIn: 'root',
})
export class VendedorService {
  private apiUrl = 'http://localhost:3001/api/vendedores';

  constructor(private http: HttpClient) {}

  getVendedores(): Observable<Vendedor[]> {
    return this.http.get<Vendedor[]>(this.apiUrl);
  }

  crearVendedor(vendedor: Vendedor): Observable<any> {
    return this.http.post(this.apiUrl, vendedor);
  }

  editarVendedor(id: number, vendedor: Vendedor): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, vendedor);
  }

  eliminarVendedor(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
