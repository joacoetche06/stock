import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';

export interface CategoriaConfig {
  nombre: string;
  prefijo: string;
}

export interface AppConfig {
  negocio: {
    nombre: string;
    nombreCorto: string;
    slogan: string;
    colorPrincipal: string;
    colorSecundario: string;
    colorAcento: string;
  };
  app: {
    puerto: number;
    nombreBD: string;
    comisionDefault: number;
  };
  inventario: {
    nombreProducto: string;
    nombreProductoPlural: string;
    nombreVendedor: string;
    nombreVendedorPlural: string;
    usaMedida: boolean;
    categoriaConMedida: string;
    medidas: string[];
    categorias: CategoriaConfig[];
    materiales: string[];
  };
}

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  private apiUrl = 'http://127.0.0.1:3001/api/config';

  // Signal global — cualquier componente puede leer la config reactivamente
  config = signal<AppConfig | null>(null);

  constructor(private http: HttpClient) {}

  cargar() {
    return this.http.get<AppConfig>(this.apiUrl).pipe(
      tap((cfg) => {
        this.config.set(cfg);
        this.aplicarColores(cfg);
      })
    );
  }

  // Aplica los colores del cliente como variables CSS globales
  private aplicarColores(cfg: AppConfig) {
    const root = document.documentElement;
    root.style.setProperty('--color-principal', cfg.negocio.colorPrincipal);
    root.style.setProperty('--color-secundario', cfg.negocio.colorSecundario);
    root.style.setProperty('--color-acento', cfg.negocio.colorAcento);
  }

  // Getters de conveniencia
  get categorias(): CategoriaConfig[] {
    return this.config()?.inventario.categorias ?? [];
  }

  get materiales(): string[] {
    return this.config()?.inventario.materiales ?? [];
  }

  get medidas(): string[] {
    return this.config()?.inventario.medidas ?? [];
  }

  get usaMedida(): boolean {
    return this.config()?.inventario.usaMedida ?? false;
  }

  get categoriaConMedida(): string {
    return this.config()?.inventario.categoriaConMedida ?? '';
  }

  get nombreProducto(): string {
    return this.config()?.inventario.nombreProducto ?? 'producto';
  }

  get nombreProductoPlural(): string {
    return this.config()?.inventario.nombreProductoPlural ?? 'productos';
  }

  get nombreVendedor(): string {
    return this.config()?.inventario.nombreVendedor ?? 'vendedor';
  }

  get nombreVendedorPlural(): string {
    return this.config()?.inventario.nombreVendedorPlural ?? 'vendedores';
  }

  get nombreNegocio(): string {
    return this.config()?.negocio.nombre ?? 'Mi Negocio';
  }

  get comisionDefault(): number {
    return this.config()?.app.comisionDefault ?? 25;
  }
}
