# Aplicación estática de análisis GMAO y SAP PM

Panel web estático para explorar exportaciones de órdenes CMMS y una página separada para analizar libros SAP PM. El procesamiento de datos ocurre en el navegador y los archivos no se transmiten a un servidor de la aplicación.

## Uso

Abre `index.html` en un navegador moderno o publica esta carpeta como sitio estático. Arrastra uno o varios archivos CSV a la zona de carga, o selecciónalos desde el equipo. Cada archivo se presenta por separado mediante el selector de grupo; para actualizar el análisis, vuelve a cargar los archivos deseados.

Se detectan automáticamente columnas habituales del flujo CMMS, entre ellas:

- Órdenes: `OT`, `Equipo`, `Tipo_equipo`, `Ubicacion_tecnica`, `Área` y `Puesto_trabajo`.
- Clasificación: `Tipo_mantenimiento`, `Estado`, `Clase_orden`, `Indicador ABC`, `Planificado` y `Grupo_planificador`.
- Medición: `Costo_total_CLP`, `Downtime_h`, `Horas_mano_obra` y `Tiempo_reparacion_h`.
- Fechas: `Fecha_creación`, `Fecha_inicio` y `Fecha_fin`.

Se admiten delimitadores CSV comunes, encabezados con o sin tildes y archivos codificados en UTF-8 o Windows-1252. La aplicación requiere una columna de orden (por ejemplo, `OT`); si una columna opcional no existe, el gráfico o KPI asociado lo indica como no disponible. Los códigos y categorías se muestran como aparecen en los archivos y no se les asigna un significado adicional.

## Filtros, indicadores e informe

El panel actualiza KPI, control de calidad (filas, órdenes únicas, identificadores repetidos, órdenes vacías y fechas no interpretables), evolución mensual, distribuciones, Pareto de costos, matriz exploratoria de frecuencia y downtime, MTTR descriptivo y resumen de equipos. Los gráficos se calculan para el archivo seleccionado.

Usa los filtros de **archivo/grupo**, **área**, **turno** y **grupo planificador**. Área, turno y grupo planificador se reconocen cuando existan sus columnas; en caso contrario, el filtro se muestra deshabilitado. Un filtro seleccionado actualiza todos los KPI, gráficos, hallazgos e informe. Las opciones se reinician al cambiar de archivo.

Pulsa **Exportar informe PDF** y elige **Guardar como PDF** en el diálogo de impresión del navegador. El informe incorpora una portada ejecutiva con identidad visual GMAO, alcance de filtros, indicadores, principales hallazgos, tabla de calidad, gráficos y recomendaciones de validación. Activa los gráficos de fondo en el diálogo de impresión para conservar la paleta corporativa. El MTTR considera solo órdenes correctivas cerradas con tiempo de reparación positivo; es una estadística descriptiva, no una medida predictiva de confiabilidad.

Los identificadores repetidos se informan sin eliminar filas automáticamente. Los resultados son exploratorios: una asociación o prioridad no demuestra una causa ni un error en SAP y debe validarse con responsables técnicos.

## Publicación estática

Sube la carpeta `nuevo analisis/` completa al repositorio y configura GitHub Pages para servirla como sitio estático (o copia los archivos de la aplicación a la carpeta de publicación configurada). La aplicación no depende de rutas locales del proyecto ni de un servidor de aplicación.

## Análisis de planes SAP PM

Abre `planes-pm.html` para seleccionar un libro `.xlsx`, `.xls` o `.xlsm`. La página inspecciona automáticamente las hojas, detecta encabezados y propone columnas según sus nombres. Revisa el mapeo sugerido en pantalla: puedes cambiar hojas y columnas antes de actualizar los resultados. Los KPI, cobertura, gráficos, candidatos de revisión e informe se calculan solo cuando los datos necesarios están disponibles; los valores que no se pueden derivar se indican como no disponibles.

La lectura de Excel usa SheetJS desde jsDelivr, por lo que la primera carga de `planes-pm.html` requiere conexión a Internet. El contenido del libro se procesa localmente; la biblioteca externa no recibe los datos del archivo. Los resultados pueden imprimirse/guardarse en PDF o descargarse como `Resultados_Analisis_Planes_PM.xlsx`.
