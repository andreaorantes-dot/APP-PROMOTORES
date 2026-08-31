# Objetivos — App Promotores

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
- Ver su propio avance hacia su meta de ventas del mes, con retroalimentación
  que motive (niveles Bronce/Plata/Oro), sin depender de que alguien más se lo
  reporte.
- Reportar acciones de la competencia (marca, qué observó, evidencia
  fotográfica) sin fricción, desde el celular.
- Seguir funcionando sin señal (zonas sin cobertura), sin perder registros ni
  exponer datos sensibles en el dispositivo.
- Poder pedir una contraseña nueva si la olvida, sin depender de encontrar a
  alguien de TI — el aviso le llega directo a su supervisor.

### Supervisor

- Ver, en tiempo real, **únicamente** a los promotores que tiene a su cargo —
  no la operación completa del país.
- Enterarse de inmediato cuándo uno de sus promotores hace check-in (y en qué
  tienda) y cuándo alcanza su meta del mes, sin tener que revisarlo a mano.
- Cerrar el día con el mismo tipo de resumen que usa gerencia, acotado a su
  equipo.
- Revisar lo que sus promotores reportan de la competencia, sin abrir el Sheet.
- Levantar un reporte cuando nota un comportamiento extraño en el historial de
  uno de los suyos (ej. checkout casi inmediato al check-in).
- Enterarse cuando uno de sus promotores pide recuperar su cuenta, para
  asignarle una contraseña nueva.

### Gerente / Administrador

- Visibilidad nacional en tiempo real: quién está activo, qué vendió cada uno,
  quién todavía no ha vendido — con filtros de fecha (incluye períodos
  anteriores: ayer, semana/mes/año pasado) y por estado del país.
- Fijar y ajustar la meta de venta de cualquier promotor directamente desde el
  tablero, sin depender de una hoja de cálculo aparte.
- Detectar oportunidades y riesgos rápido: Top 5 vendedores del día, tiendas
  que alcanzan su meta mensual, y un clic en cualquier indicador para ver en
  el mapa exactamente a quién representa.
- Exportar la información (CSV/Excel) para reportes o análisis fuera de la app.
- Poder auditar a cualquier promotor: su historial de visitas agrupado por
  día, quién lo supervisa, a qué tiendas suele ir, y reportar un
  comportamiento extraño puntual si lo nota.
- Revisar los reportes de Competencia (marca, descripción, fotos) que
  capturan los promotores, sin abrir el Sheet.

## Qué mide la app hoy

- **Actividad**: check-in/out por tienda y por día (hora, ubicación validada,
  foto).
- **Ventas**: rollos y cubetas vendidos por visita, acumulados por promotor y
  por tienda.
- **Metas**: unidades-equivalentes vendidas (rollos + cubetas ponderadas)
  contra una meta semanal, por promotor y por tienda.
- **Inteligencia de competencia**: reportes cualitativos (marca, descripción,
  fotos) capturados por los propios promotores en campo, con un panel para
  que gerencia/supervisor los revise sin abrir el Sheet.
- **Comportamiento**: gerencia/supervisor pueden dejar un reporte sobre una
  visita puntual del historial de un promotor cuando notan algo extraño.

## Pendiente de definir con el negocio

Esto **no** son decisiones técnicas — son datos/reglas que le corresponden al
negocio, no al código:

- **Precios reales** de rollo y cubeta (`PRECIO_ROLLO` / `PRECIO_CUBETA`): hoy
  están en `0` en producción; sin ellos, los tableros muestran unidades en vez
  de dinero vendido.
- **Metas de venta reales** por promotor y por tienda: hoy hay un valor de
  **prueba** (40 unidades/mes) sembrado para que la función se pueda ver
  funcionando — hay que sustituirlo por las metas reales de cada persona/tienda
  (pestaña "Metas" del Sheet, o el botón "Meta" del tablero de admin).
- Si los reportes de competencia necesitan un flujo de seguimiento (¿alguien
  los debe marcar como "revisado"?) — hoy hay un panel para verlos, pero es
  de **solo lectura**, sin ese estado.
- La columna **ESTADO** de la pestaña "Tiendas": el filtro de estado del
  tablero ya lista los 32 estados de México, pero si esa columna no está
  capturada en el Sheet, toda la actividad cae en "Sin estado" — es captura
  de datos, no una limitación del código.
- Qué pasa con los reportes de "comportamiento extraño" después de
  levantarse: hoy quedan en la misma pestaña que la retroalimentación de los
  promotores, sin un flujo de seguimiento/cierre propio.

## Fuera de alcance (por decisión, no por limitación técnica)

- **Notificaciones push reales** al sistema operativo del teléfono: se decidió
  un centro de notificaciones dentro de la app (más simple, sin infraestructura
  nueva) en vez de push real — mismo valor para el caso de uso actual.
- **Asignación fija de tiendas por promotor**: el catálogo es global; qué
  tiendas ve cada promotor se calcula por cercanía GPS en tiempo real, no por
  una relación fija en la base de datos.
- **Reportes automáticos programados**: la exportación (CSV/Excel) es manual,
  bajo demanda, no un envío periódico por correo o similar.
