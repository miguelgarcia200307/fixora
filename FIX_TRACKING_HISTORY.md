# FIX: Historial de Servicios en Tracking NO Aparece

## Problema
El historial de servicios no se muestra en ningún navegador después del cambio para soportar Safari.

## Causa
Las funciones RPC necesarias están definidas en el código pero nunca se ejecutaron en la base de datos de Supabase.

## Solución

### Paso 1: Acceder al SQL Editor de Supabase
1. Abre tu proyecto en https://supabase.com
2. Ve al menú lateral izquierdo
3. Clic en **SQL Editor**

### Paso 2: Ejecutar el Script de Fix
1. Clic en **New Query** (Nueva Consulta)
2. Copia TODO el contenido del archivo `supabase/fix_tracking_rpc.sql`
3. Pégalo en el editor
4. Clic en **Run** (Ejecutar) o presiona `Ctrl+Enter`

### Paso 3: Verificar que Funcionó
Al final del script deberías ver un resultado como:

```
status: "Funciones RPC creadas exitosamente"

nombre_funcion                      | argumentos
------------------------------------|------------------
get_intake_evidence_by_repair       | p_repair_id uuid, p_token character varying
get_stage_evidence_by_stage         | p_stage_id uuid, p_token character varying
get_stages_by_repair                | p_repair_id uuid, p_token character varying
```

Si ves las 3 funciones listadas, el fix fue exitoso ✅

### Paso 4: Probar el Tracking
1. Refresca la página de tracking (F5)
2. Abre la consola del navegador (F12)
3. El historial de servicios debería aparecer
4. Si hay algún error, aparecerá en rojo en la consola

## ¿Por qué pasó esto?

El código JavaScript fue actualizado para usar funciones RPC (get_stages_by_repair, get_stage_evidence_by_stage) que permiten el acceso público sin autenticación, necesario para que los clientes vean el tracking. Sin embargo, estas funciones solo existían en el archivo `supabase/policies.sql` pero nunca se ejecutaron en la base de datos real.

## Si el problema persiste

Abre la consola del navegador (F12) y busca mensajes como:
- ⚠️ FUNCIONES RPC NO ENCONTRADAS
- Could not find the function get_stages_by_repair
- function get_stages_by_repair(p_repair_id => uuid, p_token => character varying) does not exist

Si ves estos errores, las funciones aún no están creadas. Repite el Paso 2.
