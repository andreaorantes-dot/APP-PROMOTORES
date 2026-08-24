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

### Supervisor

- Ver, en tiempo real, **únicamente** a los promotores que tiene a su cargo —
  no la operación completa del país.
- Enterarse de inmediato cuándo uno de sus promotores hace check-in (y en qué
  tienda) y cuándo alcanza su meta del mes, sin tener que revisarlo a mano.
- Cerrar el día con el mismo tipo de resumen que usa gerencia, acotado a su
  equipo.

### Gerente / Administrador

- Visibilidad nacional en tiempo real: quién está activo, qué vendió cada uno,
  quién todavía no ha vendido.
- Fijar y ajustar la meta de venta de cualquier promotor directamente desde el
  tablero, sin depender de una hoja de cálculo aparte.
- Detectar oportunidades y riesgos rápido: Top 5 vendedores del día, tiendas
  que alcanzan su meta mensual.
- Exportar la información (CSV/Excel) para reportes o análisis fuera de la app.
- Poder auditar a cualquier promotor: su historial de visitas, quién lo
  supervisa, y a qué tiendas suele ir.

## Qué mide la app hoy

- **Actividad**: check-in/out por tienda y por día (hora, ubicación validada,
  foto).
- **Ventas**: rollos y cubetas vendidas por visita, acumuladas por promotor y
  por tienda.
- **Metas**: unidades vendidas contra una meta mensual, por promotor y por
  tienda.
- **Inteligencia de competencia**: reportes cualitativos (marca, descripción,
  fotos) capturados por los propios promotores en campo.

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
  los debe marcar como "revisado"?) — hoy es solo un registro, sin ese estado.

## Fuera de alcance (por decisión, no por limitación técnica)

- **Notificaciones push reales** al sistema operativo del teléfono: se decidió
  un centro de notificaciones dentro de la app (más simple, sin infraestructura
  nueva) en vez de push real — mismo valor para el caso de uso actual.
- **Asignación fija de tiendas por promotor**: el catálogo es global; qué
  tiendas ve cada promotor se calcula por cercanía GPS en tiempo real, no por
  una relación fija en la base de datos.
- **Reportes automáticos programados**: la exportación (CSV/Excel) es manual,
  bajo demanda, no un envío periódico por correo o similar.
