import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { from } from 'rxjs';
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
  private apiUrl = 'http://127.0.0.1:3001/api/remitos';

  private electron: any; // Declaramos la variable

  constructor(private http: HttpClient) {
    // Truco infalible para que Angular invoque el require de Electron
    const windowRequire = (window as any).require;
    if (windowRequire) {
      try {
        this.electron = windowRequire('electron');
      } catch (e) {
        console.warn('No se pudo cargar electron');
      }
    } else {
      console.warn('Electron IPC no está disponible. Los PDF nativos no funcionarán.');
    }
  }

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

  reabrirRemito(id: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/reabrir`, {});
  }

  editarRemito(id: number, datos: any) {
    return this.http.put(`${this.apiUrl}/${id}`, datos);
  }

  // En frontend/src/app/services/remito.service.ts

  registrarPago(id: number, monto: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/pagar`, { monto });
  }

  getPagosRemito(id: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${id}/pagos`);
  }

  solicitarPdfNativo(idRemito: number, vendedor: string, vista: string): Observable<any> {
    // Definimos el prefijo según qué pestaña esté abierta
    let prefijo = 'Remito';
    if (vista === 'liquidacion') prefijo = 'Liquidacion';
    if (vista === 'pagos') prefijo = 'Historial_Pagos';

    // Si estamos en Electron, mandamos el mensaje con el nombre dinámico
    if (this.electron) {
      return from(
        this.electron.ipcRenderer.invoke('generar-pdf-nativo', {
          nombreArchivo: `${prefijo}_${idRemito}_${vendedor}`,
        }),
      );
    } else {
      // Si estamos en Chrome
      window.print();
      return from([true]);
    }
  }

  getPendientesVendedor(vendedorId: number): Observable<any[]> {
    return this.http.get<any[]>(`http://127.0.0.1:3001/api/vendedores/${vendedorId}/pendientes`);
  }

  liquidarVendedor(vendedorId: number, payload: any): Observable<any> {
    return this.http.post(`http://127.0.0.1:3001/api/vendedores/${vendedorId}/liquidar`, payload);
  }
}
