// api.js — versión Supabase
// Mantiene exactamente las mismas funciones que la versión .NET
// (Api.getEquipos, Api.crearPedido, Api.login, etc.), así que app.js
// no necesita ningún cambio: solo cambió lo que hay ADENTRO de cada función.

const SUPABASE_URL = 'https://yfbiclpkcangujefeamr.supabase.co';   // reemplazar por la tuya
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmYmljbHBrY2FuZ3VqZWZlYW1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyNDM5NTUsImV4cCI6MjEwNjgxOTk1NX0.EunBx3dLDh2Z2GQnx4b1-ZLxeW7D9HrohOk6XK6WwH0';                // reemplazar por la tuya

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Llama a una Edge Function (el equivalente a un endpoint de Controller en .NET)
async function invoke(fnName, body) {
  const { data, error } = await sb.functions.invoke(fnName, { body });
  if (error) {
    let msg = 'Error de conexión con el servidor.';
    try {
      const parsed = await error.context.json();
      msg = parsed.mensaje || msg;
    } catch (_) { /* sin cuerpo JSON */ }
    throw new Error(msg);
  }
  return data;
}

async function selectPedidos(username) {
  let q = sb.from('pedidos')
    .select('id, usuario, nombre, aula, fecha, observaciones, estado, pedido_equipos(equipo_id, equipos(nombre))')
    .order('id');
  if (username) q = q.eq('usuario', username);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}

function mapPedidos(rows) {
  return rows.map(p => ({
    id: p.id,
    usuario: p.usuario,
    nombre: p.nombre,
    aula: p.aula,
    equiposIds: p.pedido_equipos.map(pe => pe.equipo_id),
    equiposNombres: p.pedido_equipos.map(pe => pe.equipos.nombre),
    fecha: p.fecha,
    obs: p.observaciones,
    estado: p.estado
  }));
}

const Api = {
  // --- Auth ---
  async login(usuario, password) {
    return invoke('login', { usuario, password });
  },

  // --- Equipos (lectura directa a la tabla; Supabase genera la API sola) ---
  async getEquipos() {
    const { data, error } = await sb.from('equipos').select('*').order('id');
    if (error) throw new Error(error.message);
    return data;
  },
  async crearEquipo(equipo) {
    return invoke('crear-equipo', equipo);
  },
  async cambiarEstadoEquipo(id, estado) {
    return invoke('cambiar-estado-equipo', { id, estado });
  },

  // --- Pedidos ---
  async getPedidos() {
    return mapPedidos(await selectPedidos());
  },
  async getPedidosPorUsuario(username) {
    return mapPedidos(await selectPedidos(username));
  },
  async crearPedido(pedido) {
    return invoke('crear-pedido', pedido);
  },
  async accionPedido(id, accion) {
    return invoke('accion-pedido', { id, accion });
  },

  // --- Reportes ---
  async getReportes() {
    const { data, error } = await sb
      .from('reportes')
      .select('id, usuario, nombre, tipo, descripcion, equipo_id, equipos(nombre)')
      .order('id');
    if (error) throw new Error(error.message);
    return data.map(r => ({
      id: r.id,
      usuario: r.usuario,
      nombre: r.nombre,
      equipoId: r.equipo_id,
      equipoNombre: r.equipos ? r.equipos.nombre : r.equipo_id,
      tipo: r.tipo,
      desc: r.descripcion
    }));
  },
  async crearReporte(reporte) {
    return invoke('crear-reporte', reporte);
  }
};
