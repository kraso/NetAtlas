// NetAtlas — shell de escritorio (Tauri v2).
// Propósito: envolver la misma UI que la PWA (frontendDist = ../dist) y
// exponer comandos locales que el navegador no puede ofrecer:
//   - abrir/importar un dataset SQLite desde el sistema de archivos (NET-HW-052)
//   - futura selección de archivo para importación de CSV (F6)
use serde::Serialize;

#[derive(Serialize)]
struct DatasetInfo {
    path: String,
    size_bytes: u64,
    exists: bool,
}

/// Inspecciona un dataset local (sin abrirlo en BD): útil para el /settings
/// de la app de escritorio (versión del esquema y tamaño).
#[tauri::command]
fn inspect_dataset(path: String) -> Result<DatasetInfo, String> {
    let meta = std::fs::metadata(&path).map_err(|e| format!("no se pudo acceder a {path}: {e}"))?;
    if !meta.is_file() {
        return Err(format!("{path} no es un archivo"));
    }
    Ok(DatasetInfo {
        path,
        size_bytes: meta.len(),
        exists: true,
    })
}

/// Lee bytes de un datasheet/imagen local (para el AssetStore del escritorio).
#[tauri::command]
fn read_asset_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("no se pudo leer {path}: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![inspect_dataset, read_asset_bytes])
        .run(tauri::generate_context!())
        .expect("error al ejecutar NetAtlas");
}