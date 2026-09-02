# Instalación y pruebas de NetAtlas

Guía para **instalar**, **probar** y **generar instaladores** (.msi/.exe en
Windows; .deb/.rpm/.AppImage en Linux) de la aplicación NetAtlas, la
enciclopedia de hardware de redes.

La app es **híbrida**: un núcleo web local-first (PWA offline) embebido en un
binario de escritorio **Tauri v2**. Los instaladores contienen la web ya
compilada → funcionan **100% offline** (el catálogo, la búsqueda y los
diagramas viajan con el binario).

---

## 0. Contenido de esta guía

- [Requisitos previos](#1-requisitos-previos-ambas-plataformas)
- [Probar la aplicación (2 modos)](#2-probar-la-aplicación)
- [Generar instaladores en Windows](#3-windows--msi-y-exe)
- [Generar instaladores en Linux](#4-linux--deb-rpm-y-appimage)
- [Instalar y verificar los paquetes](#5-instalar-y-verificar)
- [Solución de problemas](#6-solución-de-problemas)

---

## 1. Requisitos previos (ambas plataformas)

| Requisito | Versión | Nota |
|---|---|---|
| Node.js | ≥ 22.5 | `engines` del monorepo |
| pnpm | 9.15.0 | `packageManager` |
| Rust toolchain | ≥ 1.77 | solo si vas a correr/empaquetar Tauri |
| Git | cualquiera | para clonar el repo |

```bash
git clone <url-del-repositorio> hardware
cd hardware
pnpm install
pnpm typecheck   # tsc --noEmit en todos los paquetes
pnpm test        # suite unitaria (Vitest)
```

> En **Windows** el toolchain Rust debe ser `stable-x86_64-pc-windows-msvc`
> (instalado por [rustup](https://rustup.rs)) y necesitas las **Herramientas de
> compilación de C++ para Visual Studio** (Build Tools de VS 2022, carga de
> trabajo «Desarrollo para escritorio con C++») + **WebView2 Runtime**
> (preinstalado en Windows 11 y auto-servido en Windows 10).
>
> En **Linux** consulta las dependencias nativas en la sección 4.

---

## 2. Probar la aplicación

Hay **dos modos**, idénticos en Windows y Linux.

### 2a. En el navegador (PWA) — sin Rust

```bash
# Modo desarrollo con recarga en caliente:
pnpm --filter @netatlas/app dev          # → http://localhost:5173

# Build de producción offline + preview:
pnpm --filter @netatlas/app build
pnpm --filter @netatlas/app preview      # → http://127.0.0.1:4173
```

Prueba sugerida: busca `sw multilayer` → abre la ficha del Cisco Catalyst 9300 →
pestañas Protocolos/Capas OSI → pestaña **Topologías** → **Calidad** →
**Sincronizar** (cola local con backend `netatlas-server` si lo levantas).

### 2b. Como aplicación de escritorio (Tauri) — requiere Rust

```bash
pnpm --filter @netatlas/app tauri dev    # compila el binario y abre la ventana
```

---

## 3. Windows — .msi y .exe

### Build del instalador

```bash
pnpm --filter @netatlas/app tauri build
```

Salida (en `apps/app/src-tauri/target/release/bundle/`):

```
msi/NetAtlas_0.1.0_x64.msi                 # instalador MSI (WiX)
nsis/NetAtlas_0.1.0_x64-setup.exe          # instalador NSIS
```

### Instalar y probar

- Doble clic sobre el `.msi`, o `msiexec /i NetAtlas_0.1.0_x64.msi` →
  instalación por defecto en `%ProgramFiles%\NetAtlas`.
- El `-setup.exe` lanza un asistente (útil para instalación por usuario).
- Desinstalar: Panel de control → Programas, o `msiexec /x NetAtlas_0.1.0_x64.msi`.

---

## 4. Linux — .deb, .rpm y .AppImage

### Dependencias nativas de Tauri v2

**Debian / Ubuntu (para .deb):**

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
  libgtk-3-dev libsqlite3-dev
```

**Fedora / RHEL (para .rpm):**

```bash
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
  libxdo-devel libayatana-appindicator-devel librsvg2-devel \
  gtk3-devel sqlite-devel gcc-c++
```

> Con `bundle.targets = "all"` (config actual de `tauri.conf.json`) el build
> produce **.deb + .rpm + .AppImage** cuando la distro ofrece webkit2gtk-4.1.

### Build de los instaladores

```bash
pnpm --filter @netatlas/app tauri build
```

Salida (en `apps/app/src-tauri/target/release/bundle/`):

```
deb/netatlas-desktop_0.1.0_amd64.deb        # Debian/Ubuntu
rpm/netatlas-desktop-0.1.0-1.x86_64.rpm     # Fedora/RHEL
appimage/NetAtlas_0.1.0_amd64.AppImage      # portable, cualquier distro
```

> Los nombres de archivo en Linux usan el nombre del binario de `Cargo.toml`
> (`netatlas-desktop`); el `.AppImage` conserva el `productName` (`NetAtlas`).
> Verifica el nombre exacto con `ls apps/app/src-tauri/target/release/bundle/*/`.

### Instalar y probar

```bash
# Debian/Ubuntu (apt resuelve dependencias):
sudo apt install ./apps/app/src-tauri/target/release/bundle/deb/netatlas-desktop_0.1.0_amd64.deb
netatlas-desktop

# Fedora/RHEL:
sudo dnf install apps/app/src-tauri/target/release/bundle/rpm/netatlas-desktop-0.1.0-1.x86_64.rpm
netatlas-desktop

# AppImage (sin instalar):
chmod +x NetAtlas_0.1.0_amd64.AppImage
./NetAtlas_0.1.0_amd64.AppImage
```

Desinstalar: `sudo apt remove netatlas-desktop` / `sudo dnf remove netatlas-desktop`.

---

## 5. Instalar y verificar

Lista de comprobación (igual en ambos SO):

1. **Arranque offline**: desconecta la red; el catálogo, la búsqueda FTS y los
   diagramas deben funcionar desde el binario.
2. **Búsqueda**: `sw multilayer` → ficha del Catalyst 9300 → pestañas y
   enlaces a protocolos (ospf, bgp, vxlan).
3. **Topologías**: diagrama interactivo + mapa global con agregación.
4. **Calidad**: métricas del dataset (cobertura, reconciliación, dataset con
   hash SHA-256).
5. **Sincronizar**: cola local de contribuciones; con el backend opcional
   `netatlas-server` (p. ej. `pnpm --filter @netatlas/server server:e2e`) se
   sincroniza la réplica.

---

## 6. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| `tauri build` falla en Linux | Faltan dependencias nativas | instala el bloque de tu distro (sección 4) |
| `tauri build` falla en Windows | Sin Build Tools C++ o WebView2 | instala la carga «Desarrollo para escritorio con C++»; WebView2 desde Microsoft |
| Compilación Rust lenta/agotada | Primer build o memoria limitada | `NODE_OPTIONS=--max-old-space-size=2048` en el build JS; el primer build Rust tarda minutos |
| La ventana se abre en blanco | Build de frontend no presente | `pnpm --filter @netatlas/app build` antes de `tauri build` |
| `vite preview` no sirve el dataset | Seed no regenerado | `pnpm --filter @netatlas/dataset-tools dataset:build` |