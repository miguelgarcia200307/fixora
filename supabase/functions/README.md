# Supabase Edge Functions - FIXORA

## Función: create-user

Esta función permite crear usuarios que pueden hacer **login inmediato** sin necesidad de confirmar email.

### ¿Por qué es necesaria?

Supabase Auth tiene dos formas de crear usuarios:
1. `signUp()` - Requiere confirmación de email (el usuario no puede hacer login hasta confirmar)
2. `admin.createUser()` - Crea usuario sin confirmación, pero requiere `service_role` key

La `service_role` key **NUNCA** debe exponerse en el frontend (navegador). Por eso usamos una Edge Function que se ejecuta en el servidor de Supabase con los permisos necesarios.

---

## Despliegue

### 1. Instalar Supabase CLI

```bash
npm install -g supabase
```

### 2. Login en Supabase

```bash
supabase login
```

### 3. Vincular proyecto

```bash
cd c:\Users\MiguelDev\Desktop\fixora
supabase link --project-ref yymgyvjswntaziaqinxk
```

### 4. Desplegar la función

```bash
supabase functions deploy create-user --no-verify-jwt
```

> **Nota:** `--no-verify-jwt` permite que la función maneje su propia autenticación (que ya hace internamente).

---

## Verificar despliegue

Ve a tu dashboard de Supabase:
1. Navega a **Edge Functions**
2. Deberías ver `create-user` listada
3. Verifica que esté activa

---

## Uso

La función se llama automáticamente desde `authService.js` cuando un admin o superadmin crea un usuario.

### Endpoint

```
POST https://yymgyvjswntaziaqinxk.supabase.co/functions/v1/create-user
```

### Headers requeridos

```
Authorization: Bearer {access_token_del_admin}
Content-Type: application/json
apikey: {anon_key}
```

### Body

```json
{
  "email": "nuevo@usuario.com",
  "password": "contraseña123",
  "full_name": "Nombre Completo",
  "role": "tech",
  "shop_id": "uuid-del-local",
  "phone": "123456789",
  "whatsapp": "123456789",
  "commission_percentage": 30
}
```

### Respuesta exitosa

```json
{
  "success": true,
  "user": {
    "id": "uuid-del-usuario",
    "email": "nuevo@usuario.com",
    "full_name": "Nombre Completo",
    "role": "tech",
    "shop_id": "uuid-del-local"
  }
}
```

---

## Permisos

| Rol del solicitante | Puede crear |
|---------------------|-------------|
| superadmin | admin, tech (cualquier shop) |
| admin | tech (solo su shop) |
| tech | Ninguno |

---

## Solución de problemas

### Error: "No tienes permisos para crear usuarios"
- El usuario que hace la petición no es admin ni superadmin

### Error: "Token inválido"
- El access_token expiró o es inválido
- Solución: hacer login de nuevo

### Error: "User already registered"
- Ya existe un usuario con ese email
- Usar un email diferente

### La función no aparece en el dashboard
- Verificar que se desplegó correctamente
- Ejecutar `supabase functions deploy create-user` de nuevo
