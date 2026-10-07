// app.js
// Estado de sesión en memoria + render de paneles.
// Los datos (equipos, pedidos, reportes) viven en Supabase: se piden
// cada vez que se necesitan, a través de api.js.

let currentUser = null;

const FALLOS = {
  notebook: [
    'No enciende', 'Pantalla dañada o rota', 'Teclado no funciona',
    'Trackpad no responde', 'No conecta al WiFi', 'Puerto USB no funciona',
    'Problema de software / sistema', 'Batería no carga', 'Se apaga sola', 'Otro'
  ],
  tablero: [
    'Atril roto o doblado', 'Hilos sueltos o cortados', 'Tornillos faltantes o flojos',
    'Riel o guía dañada', 'Superficie rayada o golpeada', 'Fijador de hoja roto',
    'Patas inestables', 'Bisagra dañada', 'Otro'
  ]
};

const TABS = {
  docente: [
    { id: 'disponibilidad', label: 'Disponibilidad' },
    { id: 'pedir',          label: 'Hacer pedido' },
    { id: 'reportar',       label: 'Reportar fallo' },
    { id: 'historial',      label: 'Mis pedidos' },
  ],
  biblio: [
    { id: 'pedidos',  label: 'Pedidos recibidos' },
    { id: 'reportes', label: 'Reportes de fallos' },
    { id: 'equipos',  label: 'Gestión de equipos' },
  ]
};

// ---------- Login / Logout ----------

async function doLogin() {
  const u = document.getElementById('inp-u').value.trim();
  const p = document.getElementById('inp-p').value.trim();
  const err = document.getElementById('lerr');
  const btn = document.getElementById('btn-login');

  if (!u || !p) { err.textContent = '❌ Completá usuario y contraseña.'; err.style.display = 'block'; return; }

  btn.disabled = true;
  btn.textContent = 'Ingresando...';
  try {
    const user = await Api.login(u, p); // { username, role, name }
    err.style.display = 'none';
    currentUser = user;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    await applyRole();
  } catch (e) {
    err.textContent = '❌ ' + e.message;
    err.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar al sistema';
  }
}

function doLogout() {
  currentUser = null;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('inp-p').value = '';
  document.getElementById('inp-u').value = '';
}

async function applyRole() {
  document.getElementById('ulbl').textContent = currentUser.name;
  buildNav();
  await showPanel(currentUser.role === 'docente' ? 'disponibilidad' : 'pedidos');

  if (currentUser.role === 'docente') {
    try {
      const mios = await Api.getPedidosPorUsuario(currentUser.username);
      const listos = mios.filter(p => p.estado === 'aceptado').length;
      if (listos > 0) {
        toast(`📦 Tenés ${listos} pedido${listos === 1 ? '' : 's'} listo${listos === 1 ? '' : 's'} para retirar en biblioteca.`);
      }
    } catch (_) { /* si falla el aviso, no interrumpe el login */ }
  }
}

function buildNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  TABS[currentUser.role].forEach(t => {
    const b = document.createElement('button');
    b.textContent = t.label;
    b.dataset.id = t.id;
    b.onclick = () => showPanel(t.id);
    nav.appendChild(b);
  });
}

// ---------- Utilidades ----------

function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('err', isError);
  t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove('show'), 3200);
}

function ico(tipo) { return tipo === 'notebook' ? '💻' : '📋'; }

function beq(estado) {
  const c = { disponible: 'bd', ocupado: 'bo2', fallo: 'bf' };
  const l = { disponible: 'Disponible', ocupado: 'En uso', fallo: 'Con fallo' };
  return `<span class="bs ${c[estado] || 'bo2'}">${l[estado] || estado}</span>`;
}

function bped(estado) {
  const c = { pendiente: 'bo2', aceptado: 'bac', rechazado: 'bre', entregado: 'ben' };
  const l = { pendiente: 'En espera', aceptado: '📦 Listo para retirar', rechazado: 'Rechazado', entregado: 'Entregado' };
  return `<span class="bs ${c[estado] || 'bo2'}">${l[estado] || estado}</span>`;
}

function fmt(s) {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function stats(equipos) {
  return {
    total: equipos.length,
    disp: equipos.filter(e => e.estado === 'disponible').length,
    ocup: equipos.filter(e => e.estado === 'ocupado').length,
    fall: equipos.filter(e => e.estado === 'fallo').length,
  };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// Cartel fijo para pedidos "listos para retirar" (no desaparece como el toast).
async function avisoRetiro() {
  if (currentUser.role !== 'docente') return '';
  const mios = await Api.getPedidosPorUsuario(currentUser.username);
  const listos = mios.filter(p => p.estado === 'aceptado');
  if (!listos.length) return '';
  return `
    <div class="aviso-retiro">
      <div class="aviso-retiro-title">📦 Tenés equipos listos para retirar</div>
      ${listos.map(p => `<div class="aviso-retiro-item">${escapeHtml(p.equiposNombres.join(', '))} — Aula ${escapeHtml(p.aula)}</div>`).join('')}
    </div>`;
}

// Agrupa los equipos: notebooks por carro (ordenadas por número), tableros aparte.
function agruparPorCarro(equipos) {
  const notebooks = equipos.filter(e => e.tipo === 'notebook');
  const tableros = equipos.filter(e => e.tipo === 'tablero');
  const carros = {};
  notebooks.forEach(e => {
    const c = e.carro ?? 0;
    (carros[c] ??= []).push(e);
  });
  Object.values(carros).forEach(arr => arr.sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0)));
  const carroKeys = Object.keys(carros).map(Number).sort((a, b) => a - b);
  return { carroKeys, carros, tableros };
}

// ---------- Router de paneles ----------

async function showPanel(id) {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.id === id));
  const mc = document.getElementById('mc');
  mc.innerHTML = '<div class="panel"><div class="ssub">Cargando…</div></div>';
  try {
    const el = document.createElement('div');
    el.className = 'panel';
    await PANELS[id](el);
    mc.innerHTML = '';
    mc.appendChild(el);
  } catch (e) {
    mc.innerHTML = `<div class="panel"><div class="stitle">Ups</div><div class="ssub">${escapeHtml(e.message)}</div></div>`;
  }
}

const PANELS = {

  async disponibilidad(el) {
    const equipos = await Api.getEquipos();
    const s = stats(equipos);
    const { carroKeys, carros, tableros } = agruparPorCarro(equipos);
    const aviso = await avisoRetiro();

    const cardHtml = e => `
      <div class="ecard">
        <div class="eico">${ico(e.tipo)}</div>
        <div class="ename">${e.tipo === 'notebook' ? 'Notebook ' + String(e.numero).padStart(2, '0') : escapeHtml(e.nombre)}</div>
        <div class="eid">${escapeHtml(e.id)}</div>
        ${beq(e.estado)}
      </div>`;

    el.innerHTML = `
      <div class="stitle">Disponibilidad de Equipos</div>
      <div class="ssub">Estado actual de todos los equipos en tiempo real.</div>
      ${aviso}
      <div class="stats">
        <div class="sc"><div class="num">${s.total}</div><div class="lbl">Total</div></div>
        <div class="sc"><div class="num">${s.disp}</div><div class="lbl">Disponibles</div></div>
        <div class="sc"><div class="num">${s.ocup}</div><div class="lbl">En uso</div></div>
        <div class="sc"><div class="num">${s.fall}</div><div class="lbl">Con fallo</div></div>
      </div>
      ${carroKeys.map(c => `
        <div class="carro-heading">💻 Carro ${c}</div>
        <div class="egrid">${carros[c].map(cardHtml).join('')}</div>`).join('')}
      ${tableros.length ? `
        <div class="carro-heading">📋 Tableros</div>
        <div class="egrid">${tableros.map(cardHtml).join('')}</div>` : ''}`;
  },

  async pedir(el) {
    const equipos = await Api.getEquipos();
    const disp = equipos.filter(e => e.estado === 'disponible');
    const { carroKeys, carros, tableros } = agruparPorCarro(disp);

    const checkboxHtml = (e, label) => `
      <label class="eci" id="lbl-${e.id}">
        <input type="checkbox" value="${e.id}" onchange="togEci('${e.id}')"/>
        <span style="font-size:18px">${ico(e.tipo)}</span>
        <span><div class="ein">${escapeHtml(label)}</div><div class="eii">${escapeHtml(e.id)}</div></span>
      </label>`;

    const huboEquipos = carroKeys.length > 0 || tableros.length > 0;

    el.innerHTML = `
      <div class="stitle">Hacer un Pedido</div>
      <div class="ssub">Seleccioná uno o más equipos disponibles. El bibliotecario recibirá la solicitud.</div>
      <div class="fcard" style="max-width:720px">
        <h3>Solicitud de equipos</h3>
        <div class="fr"><label>Aula</label><input id="fa" type="text" placeholder="Ej: Aula 3B, Laboratorio..."/></div>
        <div class="fr">
          <label>Equipos disponibles — seleccioná los que necesitás</label>
          ${!huboEquipos
            ? `<div style="padding:14px;background:var(--light);border-radius:2px;color:var(--gray);font-size:13px;">⚠️ No hay equipos disponibles ahora mismo.</div>`
            : `<div id="esel">
              ${carroKeys.map(c => `
                <details class="carro-box">
                  <summary>💻 Carro ${c} <span class="carro-count">${carros[c].length} disponible${carros[c].length === 1 ? '' : 's'}</span></summary>
                  <div class="esel">
                    ${carros[c].map(e => checkboxHtml(e, 'Notebook ' + String(e.numero).padStart(2, '0'))).join('')}
                  </div>
                </details>`).join('')}
              ${tableros.length ? `
                <div class="carro-heading" style="margin-top:${carroKeys.length ? '18px' : '0'}">📋 Tableros disponibles</div>
                <div class="esel">${tableros.map(e => checkboxHtml(e, e.nombre)).join('')}</div>` : ''}
            </div>`}
        </div>
        <div class="fr"><label>Fecha y hora</label><input id="ff" type="datetime-local"/></div>
        <div class="fr"><label>Observaciones (opcional)</label><textarea id="fob" placeholder="Alguna aclaración..."></textarea></div>
        <button class="bsub" id="btn-pedido" ${!huboEquipos ? 'disabled' : ''}>Enviar solicitud</button>
      </div>`;
    const fe = el.querySelector('#ff');
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    fe.value = now.toISOString().slice(0, 16);
    el.querySelector('#btn-pedido').onclick = enviarPedido;
  },

  async reportar(el) {
    const equipos = await Api.getEquipos();
    const { carroKeys, carros, tableros } = agruparPorCarro(equipos);
    const optNotebook = e => `<option value="${e.id}" data-tipo="notebook">Notebook ${String(e.numero).padStart(2, '0')} (${e.id})</option>`;
    const optTablero = e => `<option value="${e.id}" data-tipo="tablero">${escapeHtml(e.nombre)}</option>`;

    el.innerHTML = `
      <div class="stitle">Reportar Fallo</div>
      <div class="ssub">Informá un problema técnico. El bibliotecario revisará y cambiará el estado del equipo.</div>
      <div class="fcard">
        <h3>Formulario de reporte</h3>
        <div class="fr">
          <label>Equipo con fallo</label>
          <select id="req" onchange="actualizarFallos()">
            <option value="">— Seleccioná el equipo —</option>
            ${carroKeys.map(c => `<optgroup label="Carro ${c}">${carros[c].map(optNotebook).join('')}</optgroup>`).join('')}
            ${tableros.length ? `<optgroup label="Tableros">${tableros.map(optTablero).join('')}</optgroup>` : ''}
          </select>
        </div>
        <div class="fr">
          <label>Tipo de problema</label>
          <select id="rtip"><option value="">— Primero seleccioná un equipo —</option></select>
        </div>
        <div class="fr"><label>Descripción</label><textarea id="rdesc" placeholder="Describí el fallo con detalle..."></textarea></div>
        <button class="bsub" id="btn-reporte">Enviar reporte</button>
      </div>`;
    el.querySelector('#btn-reporte').onclick = enviarReporte;
  },

  async historial(el) {
    const mios = (await Api.getPedidosPorUsuario(currentUser.username)).slice().reverse();
    const aviso = await avisoRetiro();
    el.innerHTML = `<div class="stitle">Mis Pedidos</div><div class="ssub">Historial de tus solicitudes y su estado.</div>${aviso}`;
    if (!mios.length) {
      el.innerHTML += `<div class="empty"><div class="ei">📭</div><p>Todavía no hiciste ningún pedido.</p></div>`;
      return;
    }
    const cls = { pendiente: 'ep', aceptado: 'ea', rechazado: 'er', entregado: 'ee' };
    el.innerHTML += `<div class="hlist">
      ${mios.map(p => `
        <div class="hcard ${cls[p.estado] || ''}">
          <div class="hctop">
            <div>
              <div class="hceqs">${escapeHtml(p.equiposNombres.join(', '))}</div>
              <div class="hcmeta">Aula: ${escapeHtml(p.aula)} &nbsp;·&nbsp; ${fmt(p.fecha)}</div>
            </div>
            ${bped(p.estado)}
          </div>
          ${p.obs ? `<div class="hcobs">"${escapeHtml(p.obs)}"</div>` : ''}
        </div>`).join('')}
    </div>`;
  },

  async pedidos(el) {
    el.innerHTML = `
      <div class="stitle">Pedidos Recibidos</div>
      <div class="ssub">Gestioná las solicitudes de los docentes.</div>`;
    const tw = document.createElement('div');
    tw.className = 'tw';
    el.appendChild(tw);
    await renderPedidos(tw);
  },

  async reportes(el) {
    el.innerHTML = `
      <div class="stitle">Reportes de Fallos</div>
      <div class="ssub">Fallos reportados por los docentes. Cambiá el estado en "Gestión de equipos".</div>`;
    const tw = document.createElement('div');
    tw.className = 'tw';
    el.appendChild(tw);
    await renderReportes(tw);
  },

  async equipos(el) {
    const equipos = await Api.getEquipos();
    const s = stats(equipos);
    const { carroKeys, carros, tableros } = agruparPorCarro(equipos);

    const cardHtml = e => `
      <div class="ecard">
        <div class="eico">${ico(e.tipo)}</div>
        <div class="ename">${e.tipo === 'notebook' ? 'Notebook ' + String(e.numero).padStart(2, '0') : escapeHtml(e.nombre)}</div>
        <div class="eid">${escapeHtml(e.id)}</div>
        ${beq(e.estado)}
        <div class="eact">
          <button class="bsm ${e.estado === 'disponible' ? 'act' : ''}" onclick="cambiarEstado('${e.id}','disponible')">Disponible</button>
          <button class="bsm ${e.estado === 'ocupado' ? 'act' : ''}"    onclick="cambiarEstado('${e.id}','ocupado')">En uso</button>
          <button class="bsm ${e.estado === 'fallo' ? 'act' : ''}"      onclick="cambiarEstado('${e.id}','fallo')">Fallo</button>
        </div>
      </div>`;

    el.innerHTML = `
      <div class="stitle">Gestión de Equipos</div>
      <div class="ssub">Cambiá el estado de cada equipo y agregá nuevos.</div>
      <div class="stats">
        <div class="sc"><div class="num">${s.total}</div><div class="lbl">Total</div></div>
        <div class="sc"><div class="num">${s.disp}</div><div class="lbl">Disponibles</div></div>
        <div class="sc"><div class="num">${s.ocup}</div><div class="lbl">En uso</div></div>
        <div class="sc"><div class="num">${s.fall}</div><div class="lbl">Con fallo</div></div>
      </div>
      ${carroKeys.map(c => `
        <div class="carro-heading">💻 Carro ${c}</div>
        <div class="egrid">${carros[c].map(cardHtml).join('')}</div>`).join('')}
      ${tableros.length ? `
        <div class="carro-heading">📋 Tableros</div>
        <div class="egrid">${tableros.map(cardHtml).join('')}</div>` : ''}
      <div style="margin-top:40px">
        <div class="stitle" style="font-size:20px;margin-bottom:4px">Agregar nuevo equipo</div>
        <div class="ssub">Registrá una notebook (se asigna a un carro) o un tablero.</div>
        <div class="fcard">
          <h3>Nuevo equipo</h3>
          <div class="fr"><label>Tipo</label>
            <select id="net" onchange="actualizarFormEquipo()">
              <option value="">— Seleccioná —</option>
              <option value="notebook">Notebook</option>
              <option value="tablero">Tablero</option>
            </select>
          </div>
          <div id="campos-notebook" style="display:none">
            <div class="fr"><label>Carro</label><input id="ncar" type="number" min="1" placeholder="Ej: 1"/></div>
            <div class="fr"><label>Número dentro del carro</label><input id="nnum" type="number" min="1" max="20" placeholder="Ej: 6"/></div>
          </div>
          <div id="campos-tablero" style="display:none">
            <div class="fr"><label>Nombre</label><input id="nen" type="text" placeholder="Ej: Tablero 04"/></div>
            <div class="fr"><label>ID / Código</label><input id="nei" type="text" placeholder="Ej: TB-04"/></div>
          </div>
          <button class="bsub" id="btn-nuevo-equipo">Agregar equipo</button>
        </div>
      </div>`;
    el.querySelector('#btn-nuevo-equipo').onclick = agregarEquipo;
  }
};

// ---------- Acciones (llaman a la API) ----------

function actualizarFallos() {
  const sel = document.getElementById('req');
  const opt = sel.options[sel.selectedIndex];
  const tipo = opt ? opt.getAttribute('data-tipo') : '';
  const rtip = document.getElementById('rtip');
  if (!tipo) { rtip.innerHTML = '<option value="">— Primero seleccioná un equipo —</option>'; return; }
  const lista = FALLOS[tipo] || [];
  rtip.innerHTML = '<option value="">— Seleccioná el tipo —</option>' + lista.map(f => `<option>${f}</option>`).join('');
}

function actualizarFormEquipo() {
  const tipo = document.getElementById('net').value;
  document.getElementById('campos-notebook').style.display = tipo === 'notebook' ? 'block' : 'none';
  document.getElementById('campos-tablero').style.display = tipo === 'tablero' ? 'block' : 'none';
}

function togEci(id) {
  const lbl = document.getElementById('lbl-' + id);
  if (lbl) lbl.classList.toggle('sel', lbl.querySelector('input').checked);
}

async function enviarPedido() {
  const aula   = document.getElementById('fa').value.trim();
  const fecha  = document.getElementById('ff').value;
  const obs    = document.getElementById('fob').value.trim();
  const ids    = Array.from(document.querySelectorAll('#esel input:checked')).map(c => c.value);

  if (!aula)   { toast('⚠️ Ingresá el aula.', true); return; }
  if (!fecha)  { toast('⚠️ Seleccioná fecha y hora.', true); return; }
  if (!ids.length) { toast('⚠️ Seleccioná al menos un equipo.', true); return; }

  try {
    await Api.crearPedido({ usuario: currentUser.username, nombre: currentUser.name, aula, equiposIds: ids, fecha, obs });
    toast('✅ Pedido enviado.');
    await showPanel('historial');
  } catch (e) { toast('❌ ' + e.message, true); }
}

async function enviarReporte() {
  const eqId   = document.getElementById('req').value;
  const tipo   = document.getElementById('rtip').value;
  const desc   = document.getElementById('rdesc').value.trim();

  if (!eqId)   { toast('⚠️ Seleccioná un equipo.', true); return; }
  if (!tipo)   { toast('⚠️ Seleccioná el tipo de problema.', true); return; }
  if (!desc)   { toast('⚠️ Describí el problema.', true); return; }

  try {
    await Api.crearReporte({ usuario: currentUser.username, nombre: currentUser.name, equipoId: eqId, tipo, desc });
    toast('✅ Reporte enviado.');
    await showPanel('disponibilidad');
  } catch (e) { toast('❌ ' + e.message, true); }
}

async function cambiarEstado(id, nuevoEstado) {
  try {
    await Api.cambiarEstadoEquipo(id, nuevoEstado);
    const l = { disponible: 'Disponible', ocupado: 'En uso', fallo: 'Con fallo' };
    toast('🔄 Equipo → ' + l[nuevoEstado]);
    await showPanel('equipos');
  } catch (e) { toast('❌ ' + e.message, true); }
}

async function agregarEquipo() {
  const tipo = document.getElementById('net').value;
  if (!tipo) { toast('⚠️ Seleccioná el tipo de equipo.', true); return; }

  try {
    if (tipo === 'notebook') {
      const carro = parseInt(document.getElementById('ncar').value, 10);
      const numero = parseInt(document.getElementById('nnum').value, 10);
      if (!carro || !numero) { toast('⚠️ Completá el carro y el número.', true); return; }
      await Api.crearEquipo({ tipo, carro, numero });
      toast(`✅ Notebook ${String(numero).padStart(2, '0')} agregada al Carro ${carro}.`);
    } else {
      const nombre = document.getElementById('nen').value.trim();
      const id = document.getElementById('nei').value.trim().toUpperCase();
      if (!nombre || !id) { toast('⚠️ Completá nombre e ID.', true); return; }
      await Api.crearEquipo({ tipo, id, nombre });
      toast('✅ "' + nombre + '" agregado.');
    }
    await showPanel('equipos');
  } catch (e) { toast('❌ ' + e.message, true); }
}

async function accionPedido(id, accion) {
  try {
    await Api.accionPedido(id, accion);
    const msgs = { aceptar: '📦 Pedido listo para retirar.', entregar: '📦 Marcado como entregado.', rechazar: '❌ Pedido rechazado. Equipos liberados.' };
    toast(msgs[accion] || 'Actualizado.');
    const tw = document.querySelector('.tw');
    if (tw) await renderPedidos(tw);
  } catch (e) { toast('❌ ' + e.message, true); }
}

async function renderPedidos(tw) {
  const list = (await Api.getPedidos()).slice().reverse();
  if (!list.length) {
    tw.innerHTML = `<div class="empty"><div class="ei">📭</div><p>No hay pedidos todavía.</p></div>`;
    return;
  }
  tw.innerHTML = `<table>
    <thead><tr><th>Docente</th><th>Aula</th><th>Equipos</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr></thead>
    <tbody>
    ${list.map(p => `
      <tr>
        <td>${escapeHtml(p.nombre)}</td>
        <td>${escapeHtml(p.aula)}</td>
        <td>
          ${p.equiposNombres.map(n => `<div>${escapeHtml(n)}</div>`).join('')}
          ${p.obs ? `<div class="tsub">"${escapeHtml(p.obs)}"</div>` : ''}
        </td>
        <td style="white-space:nowrap">${fmt(p.fecha)}</td>
        <td>${bped(p.estado)}</td>
        <td>
          ${p.estado === 'pendiente' ? `<div class="ba2"><button class="bacc" onclick="accionPedido(${p.id},'aceptar')">Listo para retirar</button><button class="brej" onclick="accionPedido(${p.id},'rechazar')">Rechazar</button></div>` : ''}
          ${p.estado === 'aceptado' ? `<div class="ba2"><button class="bdel" onclick="accionPedido(${p.id},'entregar')">Marcar entregado</button><button class="brej" onclick="accionPedido(${p.id},'rechazar')">Cancelar</button></div>` : ''}
          ${p.estado === 'entregado' || p.estado === 'rechazado' ? '<span style="color:var(--gray);font-size:12px">—</span>' : ''}
        </td>
      </tr>`).join('')}
    </tbody></table>`;
}

async function renderReportes(tw) {
  const list = (await Api.getReportes()).slice().reverse();
  if (!list.length) {
    tw.innerHTML = `<div class="empty"><div class="ei">✅</div><p>No hay reportes de fallos.</p></div>`;
    return;
  }
  tw.innerHTML = `<table>
    <thead><tr><th>Docente</th><th>Equipo</th><th>Tipo de fallo</th><th>Descripción</th></tr></thead>
    <tbody>
    ${list.map(r => `
      <tr>
        <td>${escapeHtml(r.nombre)}</td>
        <td>${escapeHtml(r.equipoNombre)}<div class="tsub">${escapeHtml(r.equipoId)}</div></td>
        <td>${escapeHtml(r.tipo)}</td>
        <td>${escapeHtml(r.desc)}</td>
      </tr>`).join('')}
    </tbody></table>`;
}

// ---------- Arranque ----------

document.getElementById('btn-login').addEventListener('click', doLogin);
document.getElementById('btn-logout').addEventListener('click', doLogout);
document.getElementById('inp-p').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('inp-u').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
