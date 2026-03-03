// supabase/functions/create-user/index.ts
// Edge Function para crear usuarios con capacidad de login inmediato

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verificar que sea POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Método no permitido' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Crear cliente Supabase con permisos de admin
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verificar autenticación del solicitante
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar que el usuario que hace la petición es admin o superadmin
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !requestingUser) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Obtener perfil del usuario solicitante
    const { data: requestingProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, shop_id')
      .eq('id', requestingUser.id)
      .single()

    if (!requestingProfile || !['superadmin', 'admin'].includes(requestingProfile.role)) {
      return new Response(
        JSON.stringify({ error: 'No tienes permisos para crear usuarios' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Obtener datos del cuerpo de la petición
    const { email, password, full_name, role, shop_id, phone, whatsapp, commission_percentage } = await req.json()

    // Validaciones básicas
    if (!email || !password || !full_name) {
      return new Response(
        JSON.stringify({ error: 'Email, contraseña y nombre completo son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validar que el rol sea válido
    const validRoles = ['admin', 'tech']
    const userRole = role || 'tech'
    
    if (!validRoles.includes(userRole)) {
      return new Response(
        JSON.stringify({ error: 'Rol inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Si es admin regular, solo puede crear usuarios para su propio shop
    let finalShopId = shop_id
    if (requestingProfile.role === 'admin') {
      if (userRole === 'admin') {
        return new Response(
          JSON.stringify({ error: 'No puedes crear otros administradores' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      finalShopId = requestingProfile.shop_id
    }

    // Crear el usuario en Auth con email_confirm: true (ya confirmado)
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // ← Esto hace que NO necesite confirmar email
      user_metadata: {
        full_name
      }
    })

    if (createError) {
      console.error('Error creating user:', createError)
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Crear el perfil del usuario
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        full_name,
        role: userRole,
        shop_id: finalShopId || null,
        phone: phone || null,
        whatsapp: whatsapp || phone || null,
        commission_percentage: commission_percentage || null,
        is_active: true
      })

    if (profileError) {
      console.error('Error creating profile:', profileError)
      // Intentar eliminar el usuario de auth si falla crear el perfil
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return new Response(
        JSON.stringify({ error: 'Error al crear el perfil del usuario' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Éxito
    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: authData.user.id,
          email: authData.user.email,
          full_name,
          role: userRole,
          shop_id: finalShopId
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
