import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ItemRemito {
  producto_id: number;
  cantidad: number;
}

export interface RemitoPayload {
  vendedor_id: number;
  items: ItemRemito[];
}

@Injectable({
  providedIn: 'root',
})
export class RemitoService {
  private apiUrl = 'http://localhost:3001/api/remitos';

  constructor(private http: HttpClient) {}

  getRemitos(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  crearRemito(payload: RemitoPayload): Observable<any> {
    return this.http.post(this.apiUrl, payload);
  }

  getRemitoItems(id: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${id}/items`);
  }

  cerrarRemito(id: number, payload: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/cerrar`, payload);
  }
}
