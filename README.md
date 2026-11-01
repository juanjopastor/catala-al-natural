# catala-al-natural

## Generar el índice de subtítulos

El script `build_data.py` procesa los archivos `.vtt` del directorio `data` y
genera `data.json` en la raíz del proyecto:

```powershell
python build_data.py
```

También se pueden indicar otras rutas:

```powershell
python build_data.py --input-dir ruta\a\subtitulos --output ruta\a\data.json
```

El JSON contiene una entrada por subtítulo, con estos campos:

- `videoId`: ID del vídeo de YouTube extraído del nombre del archivo.
- `title`: título extraído del nombre del archivo.
- `start`: instante de inicio en segundos.
- `text`: texto del subtítulo, sin etiquetas WebVTT.
- `processedText`: texto en minúsculas y sin puntuación, salvo apóstrofos,
  guiones y el punto volado de `l·l`. Incluye también el texto procesado del
  subtítulo siguiente para permitir búsquedas de frases que cruzan subtítulos.
- `nextSubOffset`: longitud, en unidades UTF-16 como las que usa JavaScript,
  del texto procesado del subtítulo actual. Una coincidencia solo pertenece a
  esta entrada si su índice inicial en `processedText` es menor que este valor.

Para validar el script:

```powershell
python -m unittest
```

## Usar el buscador web

Genera primero `data.json` si todavía no existe y luego sirve el proyecto desde
la raíz del repositorio:

```powershell
python build_data.py
python -m http.server 8000
```

Abre `http://localhost:8000` en el navegador. El índice se carga al hacer la
primera búsqueda; no abras `index.html` directamente como archivo, porque el
navegador no permite cargar `data.json` de esa forma.
