import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

/**
 * Abre el diálogo nativo de Windows para seleccionar carpeta.
 * Retorna la ruta seleccionada o null si el usuario cancela.
 * Debe ejecutarse desde el proceso con acceso al escritorio (el backend local).
 */
export async function pickFolderNative(initialDir?: string): Promise<string | null> {
  if (process.platform !== "win32") {
    // En no-Windows, devolver null para que el frontend haga fallback
    return null;
  }

  const safeInitial = (() => {
    if (!initialDir) return "";
    // Sanitizar para PowerShell: escapar comillas dobles y quitar saltos
    const trimmed = initialDir.trim().replace(/"/g, '""').replace(/[\r\n]/g, "");
    // Solo aceptar rutas que existan, si no fallback a home
    try {
      if (fs.existsSync(trimmed) && fs.statSync(trimmed).isDirectory()) return trimmed;
    } catch {}
    return "";
  })();

  const fallbackInitial = os.homedir();

  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = "Selecciona donde guardar - OpenMedia Downloader"
$f.ShowNewFolderButton = $true
$initial = "${safeInitial || fallbackInitial}".Replace('"','""')
if ($initial -ne "" -and (Test-Path -LiteralPath $initial)) { $f.SelectedPath = $initial }
$result = $f.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::Out.WriteLine($f.SelectedPath)
  exit 0
} else {
  exit 2
}
`.trim();

  return new Promise((resolve) => {
    // -STA es requerido para FolderBrowserDialog
    const child = spawn("powershell.exe", ["-NoProfile", "-STA", "-Command", psScript], {
      windowsHide: false, // debe mostrar ventana
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { child.kill(); } catch {}
        resolve(null);
      }
    }, 5 * 60 * 1000); // 5 min máximo esperando al usuario

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(null);
      }
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        const picked = stdout.trim();
        if (!picked) return resolve(null);
        // Validar que existe y es directorio
        try {
          const resolved = path.resolve(picked);
          if (fs.existsSync(resolved)) {
            const stat = fs.statSync(resolved);
            if (stat.isDirectory()) return resolve(resolved);
          }
          // Si no existe, intentar crearla (el usuario pudo escribir nueva)
          // Pero FolderBrowserDialog solo permite seleccionar existentes, así que null si no
          return resolve(null);
        } catch {
          return resolve(null);
        }
      } else if (code === 2) {
        // cancelado por usuario
        return resolve(null);
      } else {
        // error
        return resolve(null);
      }
    });
  });
}
