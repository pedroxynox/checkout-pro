# Resumen de lo construido y próximos pasos

Documento breve de lo entregado en esta ronda de trabajo y lo pendiente.

## Lo que se construyó (entregado por PRs)

### Escala y jornada
- **Turno desde el cadastro** (PR #283): la escala agrupa a cada persona por el turno elegido en el cadastro (Abertura/Intermediário/Fechamento/Apoio); grupo "Sin turno" para quien no lo tiene. Turno **obligatorio** para fiscal y operador (supervisor/gerente/admin no tienen turno fijo).
- **Estado en vivo real** (PR #284): el sello de estado del fiscal en la escala usa la misma inteligencia de la jornada; deja de quedar pegado en "Intervalo" cuando el turno ya cerró.
- **Alerta de intervalo coherente** (PR #285): la alerta de "intervalo largo" ya no molesta a quien está fuera de expediente.
- **Inactivos fuera del cuadro** (PR #286): un colaborador inactivado deja de aparecer y de contarse en la escala (aunque su cuenta esté desvinculada).
- **Ausencia a plazo protegida** (PR #293): al lanzar una ausencia a plazo (vacaciones/licencia), un **fiscal no puede desmarcar** esos días; solo gerente/supervisor/admin.

### Relógio Ponto
- **Marcaciones del día** (PR #287 y #288): pantalla propia con quién marcó punto hoy, por orden de batida, con sus horarios (entrada/salida/vuelta/cierre); incluye supervisores. Solo lectura, día en curso.
- **Botón central = cámara del punto** (PR #290): el botón central de la barra abre directo la cámara del lector de punto. **Cluby (IA) desactivada** (sin puntos de entrada en la app); se conserva el "Resumen de hoy" por reglas (sin costo).

### Indicadores y Central de Jornada
- **Saldo del equipo = solo positivas** (PR #289): el saldo actual suma solo las horas 50% positivas de cada uno + todas las 100%; el débito solo consume 50% y las 100% nunca se debitan. El saldo individual (card) puede quedar negativo.
- **"Menos canceló" por %** (PR #291): el destaque se mide en % sobre las ventas de la tienda (no en dinero); solo compite quien tiene asiduidad perfecta (sin faltas); los inactivos no aparecen en el individual.

> Nota: todos los cambios entregados con pruebas automáticas y verificación (build + tests) en verde.

## Lo que haremos a futuro

### Infraestructura (riesgos abiertos)
- **Base de datos** en plan gratuito de Render: puede expirar; migrar a un plan pago de bajo costo.
- **Notificaciones Android**: configurar FCM y publicar nuevo APK para que lleguen con la app cerrada.
- **Quitar `GEMINI_API_KEY`** del panel de Render (Cluby ya está desactivada) para cerrar cualquier costo de IA.

### Producto / decisiones
- **3 áreas ocultas**: decidir si se terminan o se retiran (Alertas de Fila, Normativas, Indicador de Quebra).
- **Limpieza opcional** del código de Cluby (hoy queda inerte, sin acceso).
- **Ausencias a plazo antiguas**: relanzar el período (o limpieza puntual) para protegerlas con la nueva marca.

### Documentación
- Documentar el proyecto rincón por rincón (tarea pendiente acordada) y poner al día los documentos existentes.
