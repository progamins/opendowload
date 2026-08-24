# Licencias de terceros

OpenMedia Downloader es software propio construido sobre las siguientes herramientas y
librerías de código abierto. Cada una conserva su propia licencia; este proyecto no
reclama derechos sobre ellas.

## Motor multimedia (procesos externos, no vinculados en el código)

| Componente | Licencia | Uso en este proyecto |
|---|---|---|
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Unlicense (dominio público) | Extracción de metadatos y descarga, invocado como proceso externo |
| [FFmpeg](https://ffmpeg.org/) | LGPL v2.1+ / GPL v2+ según los componentes activados en el build usado | Conversión y remuxado de audio/video, invocado como proceso externo |

FFmpeg no se distribuye con este repositorio: el usuario instala su propio binario
(por ejemplo, vía su gestor de paquetes del sistema). Si en el futuro se distribuye un
build de FFmpeg junto con esta aplicación (modo portable), debe usarse un build cuya
licencia se documente explícitamente (LGPL si no incluye componentes GPL, o GPL si los
incluye), y el código fuente correspondiente debe quedar accesible según los términos
de esa licencia.

## Backend

| Paquete | Licencia |
|---|---|
| express | MIT |
| cors | MIT |
| typescript | Apache-2.0 |
| tsx | MIT |
| node:sqlite (módulo integrado en Node.js) | MIT (Node.js) |

## Frontend

| Paquete | Licencia |
|---|---|
| react / react-dom | MIT |
| vite | MIT |
| typescript | Apache-2.0 |
| tailwindcss | MIT |
| lucide-react | ISC |

## Notas

- No se ha copiado código fuente de ninguno de estos proyectos; se usan como
  dependencias de paquete (npm) o como procesos externos invocados por línea de
  comandos (yt-dlp, ffmpeg).
- Antes de redistribuir binarios de yt-dlp o FFmpeg junto con esta aplicación
  (por ejemplo, en una versión portable o con instalador), revisa la licencia
  exacta del build que estés empaquetando y actualiza esta tabla en consecuencia.
