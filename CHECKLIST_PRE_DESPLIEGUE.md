# ✅ CHECKLIST COMPLETO PRE-DESPLIEGUE A PRODUCCIÓN

## 📋 VERIFICACIÓN EXHAUSTIVA DEL SISTEMA DE IMÁGENES

### ⚠️ IMPORTANTE: Sigue este checklist EN ORDEN

---

## FASE 1: CONFIGURACIÓN DE SUPABASE (CRÍTICO) 🔴

### 1.1 Marcar Buckets como Públicos
**Ubicación:** Supabase Dashboard → Storage

Para **CADA** uno de los siguientes buckets:
- [ ] `stage-evidence`
- [ ] `intake-evidence`
- [ ] `shop-logos`

**Pasos:**
1. Hacer clic en los 3 puntos (⋮) junto al bucket
2. Seleccionar **"Edit bucket"**
3. ✅ Marcar la casilla **"Public bucket"**
4. Clic en **Save**

**Verificación:** Ejecutar en SQL Editor
```sql
SELECT name, public FROM storage.buckets
WHERE name IN ('stage-evidence', 'intake-evidence', 'shop-logos');
```
**Resultado esperado:** `public = true` para los 3 buckets

---

### 1.2 Ejecutar Script de Políticas de Storage
**Archivo:** `supabase/fix_storage_policies.sql`

**Pasos:**
1. Supabase Dashboard → SQL Editor
2. Abrir el archivo `supabase/fix_storage_policies.sql`
3. Copiar TODO su contenido
4. Pegarlo en el SQL Editor
5. Clic en **RUN**

**Verificación:** El script debe ejecutarse sin errores
```sql
-- Verificar políticas creadas
SELECT policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'storage' 
AND tablename = 'objects'
AND (policyname LIKE '%evidence%' OR policyname LIKE '%logo%')
ORDER BY policyname;
```
**Resultado esperado:** Debe mostrar 9 políticas (3 por bucket: SELECT, INSERT, DELETE)

---

### 1.3 Verificar Funciones RPC de Tracking
**Archivo:** `supabase/fix_tracking_rpc.sql`

**Solo si no las ejecutaste antes:**
1. Supabase Dashboard → SQL Editor
2. Ejecutar el archivo `supabase/fix_tracking_rpc.sql`

**Verificación:**
```sql
SELECT proname 
FROM pg_proc 
WHERE proname IN (
    'get_stages_by_repair',
    'get_stage_evidence_by_stage', 
    'get_intake_evidence_by_repair'
);
```
**Resultado esperado:** Debe mostrar las 3 funciones

---

## FASE 2: DESPLIEGUE DE CÓDIGO 🚀

### 2.1 Archivos Modificados que DEBEN Desplegarse

Los siguientes archivos tienen correcciones críticas:

- [ ] `src/js/services/storageService.js`
  - ✅ Función `getEvidenceUrl()` mejorada
  - ✅ Detecta automáticamente el bucket correcto
  - ✅ Maneja URLs completas y paths

- [ ] `src/js/pages/tech.js`
  - ✅ Función `handleStageSubmit()` con manejo de errores corregido
  - ✅ No muestra error si el registro fue exitoso
  - ✅ Fotos opcionales (no bloquean el registro)

- [ ] `src/js/pages/admin.js`
  - ✅ Función de crear reparación con manejo de errores corregido
  - ✅ No muestra error si el registro fue exitoso
  - ✅ Fotos opcionales (no bloquean el registro)

### 2.2 Proceso de Despliegue

#### Opción A: Git + Hosting Automático (Vercel/Netlify)
```bash
git add .
git commit -m "fix: correcciones críticas de imágenes y manejo de errores"
git push origin main
```
**Nota:** Vercel/Netlify desplegará automáticamente

#### Opción B: Despliegue Manual (FTP/cPanel)
1. Subir los 3 archivos modificados a su ubicación en el servidor
2. Asegurarse de sobrescribir los archivos existentes
3. Verificar permisos de archivos (644)

#### Opción C: Prueba Local Primero
1. Abrir el proyecto localmente
2. Ctrl+F5 para limpiar caché
3. Probar completamente (ver FASE 3)
4. Luego desplegar a producción

---

## FASE 3: PRUEBAS FUNCIONALES ✅

### 3.1 Test: Registro de Nueva Reparación (Admin - PC)

1. [ ] Iniciar sesión como Admin
2. [ ] Ir a "Reparaciones" → "Nueva Reparación"
3. [ ] Llenar formulario completo
4. [ ] Agregar 2-3 fotos de evidencia
5. [ ] Registrar

**Resultado esperado:**
- ✅ Mensaje: "Reparación [código] creada"
- ❌ NO debe decir "Error al crear reparación"
- ✅ Se debe abrir el panel con los detalles
- ✅ Las fotos deben estar guardadas

---

### 3.2 Test: Registro de Nueva Reparación (Admin - Celular Android Chrome)

1. [ ] Abrir la app en celular Android con Chrome
2. [ ] Iniciar sesión como Admin
3. [ ] Registrar nueva reparación con fotos desde cámara
4. [ ] Hacer clic una sola vez en "Registrar"

**Resultado esperado:**
- ✅ Mensaje: "Reparación [código] creada"
- ❌ NO debe decir "Error"
- ❌ NO debe crear duplicados
- ✅ Reparación visible en la lista

---

### 3.3 Test: Registro de Avance (Técnico - PC)

1. [ ] Iniciar sesión como Técnico
2. [ ] Abrir una reparación asignada
3. [ ] Clic en "Registrar Avance"
4. [ ] Agregar título, descripción y 2-3 fotos
5. [ ] Guardar

**Resultado esperado:**
- ✅ Mensaje: "Avance registrado"
- ❌ NO debe decir "Error al registrar avance"
- ✅ Avance visible en el historial
- ✅ Fotos visibles en el historial

---

### 3.4 Test: Registro de Avance (Técnico - Celular Android Chrome) 🔴 CRÍTICO

1. [ ] Abrir la app en celular Android con Chrome
2. [ ] Iniciar sesión como Técnico
3. [ ] Abrir reparación asignada
4. [ ] Registrar avance con fotos desde cámara
5. [ ] Hacer clic UNA SOLA VEZ en "Registrar"

**Resultado esperado:**
- ✅ Mensaje: "Avance registrado"
- ❌ NO debe decir "Error"
- ❌ NO debe crear duplicados si se hace clic múltiple

---

### 3.5 Test: Visualización en Página de Tracking (SIN autenticación)

1. [ ] Copiar el código de reparación o URL de tracking
2. [ ] Abrir en **ventana incógnito** (para simular cliente)
3. [ ] Ir a `track.html?token=[token]` o buscar por código
4. [ ] Verificar que se muestra toda la información
5. [ ] **CRÍTICO:** Verificar sección "Historial de Avances"

**Resultado esperado:**
- ✅ Se muestra información de la reparación
- ✅ Se muestra el estado actual
- ✅ Se muestra historial de avances
- ✅ **SE MUESTRAN LAS FOTOS** de cada avance
- ✅ Las fotos cargan correctamente (no 403, no 404)
- ✅ Se puede hacer clic para ampliar las fotos

---

### 3.6 Test: Visualización desde Celular del Cliente (Android Chrome) 🔴 CRÍTICO

1. [ ] Enviar URL de tracking al celular del dueño del comercio (o usar el celular donde reportaste el problema)
2. [ ] Abrir en Android Chrome (el navegador donde tenías el problema)
3. [ ] Navegar por la página de tracking

**Resultado esperado:**
- ✅ Todo se visualiza correctamente
- ✅ Las fotos del historial SE VEN
- ✅ No hay errores 403 Forbidden
- ✅ No hay errores de red en consola (F12)

---

### 3.7 Test: Clic Múltiple (Anti-duplicados)

1. [ ] Registrar un avance
2. [ ] Hacer clic MÚLTIPLES VECES rápido en "Registrar"
3. [ ] Verificar el historial

**Resultado esperado:**
- ✅ Solo se crea UN avance
- ❌ NO se crean duplicados

---

## FASE 4: LIMPIEZA DE CACHÉ 🧹

### 4.1 Caché del Navegador PC
- Chrome: Ctrl+Shift+Supr → Borrar caché
- Firefox: Ctrl+Shift+Supr → Borrar caché
- O simplemente: Ctrl+F5 en la página

### 4.2 Caché del Celular Android Chrome (IMPORTANTE)
1. Abrir Chrome en el celular
2. Menú (⋮) → **Configuración**
3. **Privacidad y seguridad**
4. **Borrar datos de navegación**
5. Seleccionar: ✅ Archivos e imágenes en caché
6. **Borrar datos**

### 4.3 Test en Modo Incógnito
- Siempre prueba en ventana incógnito primero
- Esto simula un cliente nuevo sin caché

---

## FASE 5: VERIFICACIÓN CON SQL 🔍

### 5.1 Verificar que las Imágenes se Guardan Correctamente

Ejecuta con un `repair_id` real:
```sql
SELECT 
    se.id,
    se.file_url,
    se.file_name,
    rs.stage_name,
    se.created_at
FROM stage_evidence se
JOIN repair_stages rs ON se.stage_id = rs.id
WHERE rs.repair_id = 'REEMPLAZA-CON-UUID-REAL'
ORDER BY se.created_at DESC;
```

**Verificar:**
- [ ] `file_url` empieza con `https://`
- [ ] `file_url` contiene tu proyecto de Supabase
- [ ] `file_url` contiene `/public/stage-evidence/`

**Ejemplo de URL correcta:**
```
https://yymgyvjswntaziaqinxk.supabase.co/storage/v1/object/public/stage-evidence/[shop-id]/[repair-id]/[stage-id]/[filename].jpg
```

---

### 5.2 Test Manual de Acceso a Imagen

1. [ ] Copiar una URL completa de `file_url` del query anterior
2. [ ] Abrir en navegador **incógnito**
3. [ ] La imagen debe abrirse SIN pedir login

**Si da ERROR 403:**
- Los buckets NO están públicos → Volver a FASE 1.1
- Las políticas no están bien → Volver a FASE 1.2

**Si da ERROR 404:**
- El archivo no existe en Storage
- Verificar que la subida funcionó correctamente

---

## FASE 6: MONITOREO POST-DESPLIEGUE 📊

### 6.1 Revisar Consola del Navegador (F12)

Después de cada acción (registrar, visualizar), revisar:
- [ ] No hay errores rojos en Console
- [ ] No hay errores 403 o 404 en Network
- [ ] Las imágenes cargan correctamente en Network tab

### 6.2 Logs de Supabase

En Dashboard → Logs:
- [ ] Verificar que no haya errores de RPC
- [ ] Verificar que no haya errores de Storage
- [ ] Verificar que las políticas no bloqueen accesos legítimos

---

## 🚨 PROBLEMAS COMUNES Y SOLUCIONES

### Problema 1: "Error al registrar" pero sí registra
**Estado:** ✅ CORREGIDO en código
**Acción:** Asegúrate de desplegar los archivos actualizados (FASE 2)

### Problema 2: Imágenes no se ven (403 Forbidden)
**Causa:** Buckets no públicos o políticas incorrectas
**Solución:** Repetir FASE 1 completa

### Problema 3: Imágenes no se ven (404 Not Found)
**Causa:** El archivo no se subió correctamente
**Solución:** 
1. Verificar que uploadFile() está funcionando
2. Verificar Storage en Dashboard de Supabase
3. Ver si hay archivos en los buckets

### Problema 4: Funciona en PC pero no en Android Chrome
**Causa:** Caché del navegador móvil
**Solución:** 
1. Borrar caché (FASE 4.2)
2. Abrir en modo incógnito
3. Verificar que los archivos JS se desplegaron

### Problema 5: Se crean duplicados al hacer clic múltiple
**Estado:** ✅ CORREGIDO en código (pero hay un delay natural)
**Nota:** Puede haber un pequeño delay antes de que se deshabilite el botón, esto es normal

### Problema 6: Fotos muy grandes tardan mucho en subir
**Configuración actual:**
- MAX_SIZE_MB: 5
- MAX_WIDTH: 1920
- QUALITY: 0.85
- Las fotos se comprimen automáticamente

**Si sigue siendo problema:**
- Puedes reducir MAX_WIDTH a 1280
- O reducir QUALITY a 0.75
- Editar en `src/js/config.js`

---

## ✅ CHECKLIST FINAL

Antes de dar por completado:

- [ ] Los 3 buckets están públicos en Supabase
- [ ] Las políticas de Storage se ejecutaron sin errores
- [ ] Las funciones RPC existen y funcionan
- [ ] Los 3 archivos JavaScript se desplegaron a producción
- [ ] Se probó registrar reparación desde PC
- [ ] Se probó registrar reparación desde celular Android
- [ ] Se probó registrar avance desde PC
- [ ] Se probó registrar avance desde celular Android
- [ ] Las fotos se VEN en la página de tracking
- [ ] Las fotos se VEN desde el celular Android Chrome
- [ ] No hay errores de "Error al registrar"
- [ ] No se crean duplicados
- [ ] Las URLs de las fotos están correctas en la BD
- [ ] Se puede acceder a las fotos sin autenticación

---

## 📞 SOPORTE ADICIONAL

Si después de seguir TODO este checklist aún hay problemas:

1. **Ejecutar:** `supabase/VERIFICACION_IMAGENES.sql` (queries de diagnóstico)
2. **Capturar:** 
   - Screenshot del error
   - Console (F12) con errores
   - Network tab mostrando requests fallidos
3. **Verificar:**
   - ¿Qué query de VERIFICACION_IMAGENES.sql falla?
   - ¿Qué mensaje de error exacto aparece?

---

## 📝 NOTAS IMPORTANTES

1. **Orden de ejecución:** Seguir el checklist EN ORDEN, no saltarse pasos
2. **Buckets públicos:** Es el paso MÁS IMPORTANTE, sin esto nada funciona
3. **Limpiar caché:** Siempre después de desplegar cambios
4. **Modo incógnito:** Ideal para pruebas de tracking público
5. **Consola F12:** Tu mejor amigo para diagnosticar problemas

---

**Tiempo estimado para completar:** 20-30 minutos
**Última actualización:** Hoy (correcciones aplicadas)
