# Objetivos — App Promotores

> Última revisión: 15-oct-2026, contra el código de la rama `pruebas`
> (commit `dbb14d3`).

## Objetivo general

Dar visibilidad **en tiempo real** de la operación de los promotores de campo
de Protexa — dónde están, qué venden, cómo va cada uno contra su meta, y qué
está haciendo la competencia — para que supervisores y gerencia puedan actuar
sobre datos del día, no sobre reportes que llegan días después.

## Objetivos por rol

### Promotor (campo)

- Registrar sus visitas (check-in/out) de forma confiable: con foto de
  evidencia y ubicación **validada por el servidor** (no por el teléfono, que
  se puede falsificar).
- Confirmar que sigue en la tienda: una vez al día, en un momento aleatorio
  entre 10 am y 4 pm (solo con un check-in abierto), la app le pregunta Sí/No
  y guarda su ubicación del momento.
- Ver su propio avance hacia su **meta semanal** de ventas, con
  retroalimentación que motive (niveles Bronce/Plata/Oro), sin depender de que
  alguien más se lo reporte.
- Reportar acciones de la competencia (marca, qué observó, evidencia
  fotográfica) sin fricción, desde el celular.
- Reportar un problema ("algo no funciona") y **darle seguimiento**: ve sus
  tickets, lee la respuesta de administración, puede comentar y ve cuándo se
  cierra.
- Capacitarse desde la app: secciones de **Capacitación** (cómo hacer mejor el
  trabajo) y **Soporte** (información técnica de producto), con quiz y
  tarjetas de repaso; su progreso queda guardado.
- Seguir funcionando sin señal (zonas sin cobertura), sin perder registros ni
  exponer datos sensibles en el dispositivo.
- Poder pedir una contraseña nueva si la olvida, sin depender de encontrar a
  alguien de TI — el aviso le llega directo a su supervisor.

### Supervisor

- Ver, en tiempo real, **únicamente** a los promotores que tiene a su cargo —
  no la operación completa del país.
- Enterarse de inmediato cuándo uno de sus promotores hace check-in (en qué
  tienda y si llegó a tiempo o tarde, con 15 min de tolerancia sobre su hora de
  entrada) y cuándo alcanza su meta, sin tener que revisarlo a mano.
- Cerrar el día con el mismo tipo de resumen que usa gerencia, acotado a su
  equipo, y recibir el **reporte semanal** de KPIs de su equipo.
- Revisar lo que sus promotores reportan de la competencia, sin abrir el Sheet.
- Hablar con administración en un **hilo propio** (estilo foro, no chat en
  vivo) para dudas y seguimiento.
- Levantar un reporte cuando nota un comportamiento extraño en el historial de
  uno de los suyos (ej. checkout casi inmediato al check-in).
- Enterarse cuando uno de sus promotores pide recuperar su cuenta, para
  asignarle una contraseña nueva.

### Gerente / Administrador

- Visibilidad nacional en tiempo real: quién está activo, qué vendió cada uno,
  quién todavía no ha vendido, asistencia y puntualidad — con filtros de fecha
  (incluye períodos anteriores: ayer, semana/mes/año pasado, y rango
  personalizado) y por estado del país.
- Fijar y ajustar la meta semanal de cualquier promotor directamente desde el
  tablero, sin depender de una hoja de cálculo aparte.
- Detectar oportunidades y riesgos rápido: Top 5 vendedores del día, tiendas
  que alcanzan su meta, y un clic en cualquier indicador para ver en el mapa
  exactamente a quién representa.
- Exportar la información (CSV/Excel, incluye el ID de la tienda) para reportes
  o análisis fuera de la app, también por supervisor.
- Poder auditar a cualquier promotor: su historial de visitas agrupado por
  día, quién lo supervisa, a qué tiendas suele ir, y reportar un
  comportamiento extraño puntual si lo nota.
- Revisar los reportes de Competencia (marca, descripción, fotos) que
  capturan los promotores, sin abrir el Sheet.
- Atender el **buzón** de tickets de los promotores (responder, cerrar y
  reabrir) y los hilos de cada supervisor.
- Administrar desde el tablero las **alertas de retroalimentación** (correo +
  push): encenderlas/apagarlas y agregar o quitar destinatarios.

## Qué mide la app hoy

- **Actividad**: check-in/out por tienda y por día (hora, ubicación validada,
  foto), y confirmaciones de "sigo en tienda".
- **Asistencia y puntualidad**: contra la hora de "Entrada" de cada promotor
  (en su zona horaria), con 15 min de tolerancia.
- **Ventas**: rollos y cubetas vendidos por visita, acumulados por promotor y
  por tienda (los galones ya no se usan en ningún flujo).
- **Metas**: unidades-equivalentes vendidas (rollos + cubetas ponderadas)
  contra una **meta semanal**, por promotor y por tienda. Sin meta
  personalizada se usa el default de 30 unidades por semana.
- **Inteligencia de competencia**: reportes cualitativos (marca, descripción,
  fotos) capturados por los propios promotores en campo, con un panel para
  que gerencia/supervisor los revise sin abrir el Sheet.
- **Comportamiento**: gerencia/supervisor pueden dejar un reporte sobre una
  visita puntual del historial de un promotor cuando notan algo extraño.
- **Capacitación**: progreso de cada persona en quiz y tarjetas de repaso.

## Pendiente de definir con el negocio

Esto **no** son decisiones técnicas — son datos/reglas que le corresponden al
negocio, no al código:

- **Precios reales** de rollo y cubeta (`PRECIO_ROLLO` / `PRECIO_CUBETA`): el
  código los lee de variables de entorno con default `0`; sin ellos, los
  tableros muestran unidades en vez de dinero vendido. *Verificar en Render
  qué valor tienen hoy.*
- **Metas de venta reales** por promotor y por tienda: el script
  `seed-promoter-goals.mjs` siembra un valor de **prueba** para quien no tenga
  meta (la versión anterior de este documento hablaba de 40 unidades). Hay que
  revisar la pestaña "Metas" del Sheet y sustituir esos valores por las metas
  reales (pestaña "Metas" o botón "Meta" del tablero de admin). Definir
  también si el default de 30 por semana sigue siendo el correcto.
- **Contenido de Capacitación y Soporte**: las pestañas `Capacitacion`,
  `Capacitacion_Quiz` y `Capacitacion_Flashcards` se crean solas pero vacías;
  sin contenido, la sección muestra "todavía no hay contenido". Lo redacta el
  negocio.
- **Alertas de retroalimentación**: quién debe recibir el correo y el push
  (pestaña `AlertasRetroDestinatarios`, tema de ntfy.sh) y si se encienden
  (`Activo = SI`). Requiere además instalar el Google Apps Script descrito en
  MANUAL_DESPLIEGUE.md.
- **Correo del reporte semanal**: sin `SMTP_HOST/USER/PASS` el reporte semanal
  solo llega dentro de la app. Falta definir la cuenta que lo enviará.
- Si los reportes de competencia necesitan un flujo de seguimiento (¿alguien
  los debe marcar como "revisado"?) — hoy hay un panel para verlos, pero es
  de **solo lectura**, sin ese estado.
- La columna **ESTADO** de las pestañas "Promotores" y "Tiendas": el filtro de
  estado del tablero ya lista los 32 estados de México, pero si esa columna no
  está capturada, la actividad cae en "Sin estado" — es captura de datos, no
  una limitación del código.
- Qué pasa con los reportes de "comportamiento extraño" después de
  levantarse: siguen en la pestaña `Retroalimentacion`, sin flujo de
  seguimiento/cierre propio. (Los tickets con estado abierto/cerrado cubren
  los reportes que hacen los promotores, no estos.)

## Fuera de alcance (por decisión, no por limitación técnica)

- **Notificaciones push reales al sistema operativo** para el resto de los
  avisos: se decidió un centro de notificaciones dentro de la app (campana).
  La única excepción es el push vía ntfy.sh de las alertas de
  retroalimentación.
- **Chat en vivo**: los hilos de supervisor↔administración y de tickets son
  estilo foro (se cargan al abrir y con el botón "Actualizar").
- **Asignación fija de tiendas por promotor**: el catálogo es global; qué
  tiendas ve cada promotor se calcula por cercanía GPS en tiempo real, no por
  una relación fija en la base de datos.
- **Reportes automáticos programados con hora fija**: la exportación
  (CSV/Excel) es manual; el reporte semanal se dispara cuando alguien abre la
  campana después de cumplirse la semana, no a una hora fija.
