import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Producto {
  id?: number;
  codigo?: string; // Le ponemos el '?' porque ahora el código no es obligatorio al enviarlo
  categoria?: string;
  material?: string;
  medida?: string; // <-- NUEVO
  nombre: string;
  precio: number;
  stock_real: number;
  stock_disponible: number;
}

@Injectable({
  providedIn: 'root',
})
export class ProductoService {
  private apiUrl = 'http://localhost:3001/api/productos';

  constructor(private http: HttpClient) {}

  getProductos(): Observable<Producto[]> {
    return this.http.get<Producto[]>(this.apiUrl);
  }

  crearProducto(producto: Producto): Observable<any> {
    return this.http.post(this.apiUrl, producto);
  }

  editarProducto(id: number, producto: Producto): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, producto);
  }

  eliminarProducto(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  aumentoMasivo(ids: number[], porcentaje: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/aumento-masivo`, { ids, porcentaje });
  }

  crearProductosMasivo(productos: any[]) {
    return this.http.post(`${this.apiUrl}/masivo`, { productos });
  }
}
