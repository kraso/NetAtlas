// Punto de entrada binario (memoria mínima; la lógica vive en lib.rs)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    netatlas_desktop_lib::run()
}