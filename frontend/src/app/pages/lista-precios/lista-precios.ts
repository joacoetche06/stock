import { Component, signal, computed, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductoService } from '../../services/producto.service';
import { RemitoService } from '../../services/remito.service';
import { ConfigService } from '../../services/config.service';
import Swal from 'sweetalert2';
import QRCode from 'qrcode';

interface ItemLista {
  codigo: string;
  nombre: string;
  categoria: string;
  precio: number;
}

interface GrupoLista {
  categoria: string;
  filas: (ItemLista | null)[][]; // filas de la tabla impresa, 3 columnas por fila
}

type Origen = 'remito' | 'stock';

const COLUMNAS_IMPRESION = 3;

// Dirección de la app "Precios" (PWA). La lista viaja en el #hash del link:
// nunca llega al servidor, se procesa solo en el celular.
const URL_APP_PRECIOS = 'https://joacoetche06.github.io/precios/';

// Con nombres el link mide ~3 KB para 190 productos y ya no entra en un QR.
// Sin nombres mide ~1 KB: entra en el QR y WhatsApp lo puede tomar como link.
const INCLUIR_NOMBRES = false;

@Component({
  selector: 'app-lista-precios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lista-precios.html',
  styleUrl: './lista-precios.css',
})
export class ListaPreciosComponent {
  origen = signal<Origen>('remito');
  remitos = signal<any[]>([]);
  remitoId = signal<number | null>(null);
  items = signal<ItemLista[]>([]);
  cargando = signal(false);
  generadaEl = signal<Date>(new Date());

  private electron: any = null;

  remitoSeleccionado = computed(() => this.remitos().find((r) => r.id === this.remitoId()) ?? null);

  descripcionOrigen = computed(() => {
    if (this.origen() === 'stock') return 'Stock disponible';
    const r = this.remitoSeleccionado();
    return r ? `Remito #${r.id} (${r.vendedor})` : '';
  });

  // Agrupado por categoría y repartido en columnas "de arriba hacia abajo",
  // como una guía: así se busca un código bajando por la columna.
  grupos = computed<GrupoLista[]>(() => {
    const porCategoria = new Map<string, ItemLista[]>();
    for (const it of this.items()) {
      if (!porCategoria.has(it.categoria)) porCategoria.set(it.categoria, []);
      porCategoria.get(it.categoria)!.push(it);
    }

    const orden = this.configService.categorias.map((c) => c.nombre);
    const categorias = [...porCategoria.keys()].sort((a, b) => {
      const ia = orden.indexOf(a), ib = orden.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
    });

    return categorias.map((categoria) => {
      const lista = porCategoria.get(categoria)!;
      const cantFilas = Math.ceil(lista.length / COLUMNAS_IMPRESION);
      const filas: (ItemLista | null)[][] = [];
      for (let f = 0; f < cantFilas; f++) {
        const fila: (ItemLista | null)[] = [];
        for (let c = 0; c < COLUMNAS_IMPRESION; c++) fila.push(lista[c * cantFilas + f] ?? null);
        filas.push(fila);
      }
      return { categoria, filas };
    });
  });

  constructor(
    private productoService: ProductoService,
    private remitoService: RemitoService,
    public configService: ConfigService,
  ) {
    afterNextRender(() => {
      const windowRequire = (window as any).require;
      if (windowRequire) {
        try {
          this.electron = windowRequire('electron');
        } catch {
          this.electron = null;
        }
      }
      this.cargarRemitos();
    });
  }

  get nombreVendedor() {
    return this.configService.nombreVendedor;
  }

  get nombreNegocio() {
    return this.configService.nombreNegocio;
  }

  cargarRemitos() {
    this.remitoService.getRemitos().subscribe({
      next: (data) => {
        const pendientes = data
          .filter((r) => r.estado === 'Pendiente')
          .sort((a, b) => b.id - a.id);
        this.remitos.set(pendientes);
        if (pendientes.length === 0) this.cambiarOrigen('stock');
      },
      error: () => Swal.fire('Error', 'No se pudieron cargar los remitos.', 'error'),
    });
  }

  cambiarOrigen(origen: Origen) {
    this.origen.set(origen);
    this.items.set([]);
    if (origen === 'stock') this.cargarDesdeStock();
    else if (this.remitoId()) this.cargarDesdeRemito(this.remitoId()!);
  }

  elegirRemito(id: number | string) {
    const n = Number(id);
    this.remitoId.set(n || null);
    this.items.set([]);
    if (n) this.cargarDesdeRemito(n);
  }

  private cargarDesdeRemito(id: number) {
    this.cargando.set(true);
    this.remitoService.getRemitoItems(id).subscribe({
      next: (data) => {
        // Solo lo que sigue en manos de quien lleva el remito (lo que efectivamente va a la feria)
        const enMano = data.filter(
          (i) => i.cantidad_entregada - (i.cantidad_vendida || 0) - (i.cantidad_devuelta || 0) > 0,
        );
        this.setItems(enMano);
      },
      error: () => {
        this.cargando.set(false);
        Swal.fire('Error', 'No se pudieron cargar los productos del remito.', 'error');
      },
    });
  }

  private cargarDesdeStock() {
    this.cargando.set(true);
    this.productoService.getProductos().subscribe({
      next: (data) => this.setItems(data.filter((p) => (p.stock_disponible ?? 0) > 0)),
      error: () => {
        this.cargando.set(false);
        Swal.fire('Error', 'No se pudieron cargar los productos.', 'error');
      },
    });
  }

  private setItems(data: any[]) {
    const items: ItemLista[] = data
      .filter((p) => p.codigo)
      .map((p) => ({
        codigo: String(p.codigo).trim(),
        nombre: p.nombre ?? '',
        categoria: p.categoria || this.categoriaPorCodigo(p.codigo),
        precio: Number(p.precio) || 0,
      }))
      .sort((a, b) => compararCodigos(a.codigo, b.codigo));
    this.items.set(items);
    this.generadaEl.set(new Date());
    this.cargando.set(false);
  }

  private categoriaPorCodigo(codigo: string): string {
    const prefijo = String(codigo).match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? '';
    return this.configService.categorias.find((c) => c.prefijo === prefijo)?.nombre ?? 'Otros';
  }

  sinPrecio = computed(() => this.items().filter((i) => !i.precio).length);

  formatoPrecio(n: number): string {
    return '$ ' + Math.round(n).toLocaleString('es-AR');
  }

  formatoFecha(d: Date): string {
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private nombreArchivoBase(): string {
    const d = this.generadaEl();
    const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const sufijo = this.origen() === 'remito' && this.remitoId() ? `remito-${this.remitoId()}` : 'stock';
    return `lista-precios_${sufijo}_${fecha}`;
  }

  async guardarPdf() {
    if (!this.items().length) return;
    if (this.electron) {
      const ok = await this.electron.ipcRenderer.invoke('generar-pdf-nativo', {
        nombreArchivo: this.nombreArchivoBase(),
      });
      if (ok) Swal.fire({ icon: 'success', title: 'PDF guardado', timer: 1500, showConfirmButton: false });
    } else {
      window.print();
    }
  }

  // Formato compacto (v2), una línea por producto:
  //   2|AAAAMMDD|origen|negocio
  //   AN01 12000          ← el prefijo se escribe solo cuando cambia
  //   02 12000            ← = AN02
  //   =X-9 5000           ← códigos sin formato LETRAS+NÚMERO van completos
  // Con INCLUIR_NOMBRES, cada línea termina en " nombre".
  private textoCompacto(): string {
    const d = this.generadaEl();
    const p2 = (n: number) => String(n).padStart(2, '0');
    const limpiar = (t: string) => String(t ?? '').replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

    const lineas = [
      `2|${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}|${limpiar(this.descripcionOrigen())}|${limpiar(this.nombreNegocio)}`,
    ];
    let prefijoAnterior: string | null = null;
    for (const it of this.items()) {
      const codigo = it.codigo.toUpperCase();
      const m = codigo.match(/^([A-Z]+)(\d+)$/);
      let cod: string;
      if (m) {
        cod = (m[1] === prefijoAnterior ? '' : m[1]) + m[2];
        prefijoAnterior = m[1];
      } else {
        cod = '=' + codigo.replace(/\s+/g, '');
        prefijoAnterior = null;
      }
      const nombre = INCLUIR_NOMBRES && it.nombre ? ' ' + limpiar(it.nombre) : '';
      lineas.push(`${cod} ${Math.round(it.precio)}${nombre}`);
    }
    return lineas.join('\n');
  }

  async mostrarLinkCelular() {
    if (!this.items().length) return;
    const color = this.configService.config()?.negocio.colorPrincipal;

    let link: string;
    try {
      link = URL_APP_PRECIOS + '#p=' + (await comprimir(this.textoCompacto()));
    } catch (e) {
      console.error(e);
      Swal.fire('Error', 'No se pudo generar el link.', 'error');
      return;
    }

    let qr = '';
    try {
      qr = await QRCode.toDataURL(link, { errorCorrectionLevel: 'L', margin: 3, width: 840 });
    } catch {
      qr = ''; // demasiado largo para un QR: queda solo el link
    }

    const res = await Swal.fire({
      title: 'Pasar la lista al celular',
      html: qr
        ? `<p>Abrí la cámara del celular y apuntá a este código.</p>
           <img src="${qr}" alt="Código QR" style="width: 400px; max-width: 100%; image-rendering: pixelated" />
           <p style="font-size: 15px; color: #666">También podés copiar el link y mandártelo por WhatsApp.</p>`
        : `<p>Copiá el link y mandátelo por WhatsApp.</p>`,
      showCancelButton: true,
      confirmButtonText: 'Copiar link',
      cancelButtonText: 'Cerrar',
      confirmButtonColor: color,
      width: 560,
    });
    if (!res.isConfirmed) return;

    const mensaje = `Lista de precios del ${this.formatoFecha(this.generadaEl())} (${this.items().length} productos):\n${link}`;
    try {
      if (this.electron?.clipboard) this.electron.clipboard.writeText(mensaje);
      else await navigator.clipboard.writeText(mensaje);
      Swal.fire({ icon: 'success', title: 'Link copiado', text: 'Pegalo en WhatsApp y tocalo desde el celular.', confirmButtonColor: color });
    } catch {
      Swal.fire('Error', 'No se pudo copiar el link.', 'error');
    }
  }
}

// Texto → deflate-raw → base64url (la PWA hace el camino inverso)
async function comprimir(texto: string): Promise<string> {
  const stream = new Blob([texto]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Orden natural: AR2 < AR10 < PU01 < PU133
function compararCodigos(a: string, b: string): number {
  const ma = a.toUpperCase().match(/^([A-Z]*)(\d*)(.*)$/)!;
  const mb = b.toUpperCase().match(/^([A-Z]*)(\d*)(.*)$/)!;
  return (
    ma[1].localeCompare(mb[1]) ||
    (parseInt(ma[2] || '0', 10) - parseInt(mb[2] || '0', 10)) ||
    ma[3].localeCompare(mb[3])
  );
}