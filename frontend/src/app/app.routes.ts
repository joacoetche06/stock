import { Routes } from '@angular/router';
import { ProductosComponent } from './pages/productos/productos';
import { VendedoresComponent } from './pages/vendedores/vendedores';
import { RemitosComponent } from './pages/remitos/remitos';
import { EtiquetasComponent } from './pages/etiquetas/etiquetas';
export const routes: Routes = [
  { path: 'productos', component: ProductosComponent },
  { path: 'vendedores', component: VendedoresComponent },
  { path: 'remitos', component: RemitosComponent },
  { path: 'etiquetas', component: EtiquetasComponent },

  // Si alguien entra a la raíz vacía, lo mandamos a productos por defecto
  { path: '', redirectTo: '/productos', pathMatch: 'full' },
];
