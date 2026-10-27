/* El catálogo se carga desde catalogo.json o desde la URL externa indicada
   en <meta name="catalogo-url">. */
let CONFIG = {};
let CATEGORIAS = [];
let PRODUCTOS = [];
const CATALOG_CACHE_KEY = "catalogo_datos_cache";

function validarCatalogo(datos) {
  if (!datos?.config || !Array.isArray(datos.categorias) || !Array.isArray(datos.productos)) {
    throw new Error("El catálogo no tiene el formato esperado.");
  }
  datos.productos.forEach((p) => {
    if (p.id == null || !p.nombre || !p.categoria || !Number.isFinite(Number(p.precio)) || !Array.isArray(p.talles)) {
      throw new Error(`Producto inválido: ${p.nombre || p.id || "sin identificar"}`);
    }
    p.precio = Number(p.precio);
    if (p.precioAnterior != null) p.precioAnterior = Number(p.precioAnterior);
  });
  return datos;
}

async function cargarCatalogo() {
  const externa = document.querySelector('meta[name="catalogo-url"]')?.content?.trim();
  try {
    const respuesta = await fetch(externa || "catalogo.json", { cache: "no-store" });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const datos = validarCatalogo(await respuesta.json());
    try { localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(datos)); } catch {}
    return datos;
  } catch (error) {
    try {
      const cache = localStorage.getItem(CATALOG_CACHE_KEY);
      if (cache) return validarCatalogo(JSON.parse(cache));
    } catch {}
    throw new Error(`No se pudo cargar el catálogo (${error.message}).`);
  }
}

/* =========================================================
   UTILIDADES
   ========================================================= */
const $ = (sel) => document.querySelector(sel);
const fmt = (n) => new Intl.NumberFormat(CONFIG.locale, { style: "currency", currency: CONFIG.moneda, maximumFractionDigits: 0 }).format(n);
const catName = (id) => CATEGORIAS.find((c) => c.id === id)?.nombre ?? "";
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function openLayer(el) { el.hidden = false; document.body.classList.add("no-scroll"); }
function closeLayer(el) {
  el.hidden = true;
  if (document.querySelectorAll(".modal:not([hidden]), .drawer:not([hidden])").length === 0) {
    document.body.classList.remove("no-scroll");
  }
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

/* =========================================================
   CARRITO (se guarda en el navegador)
   ========================================================= */
const CART_KEY = "catalogo_carrito";
const ORDER_DRAFT_KEY = "catalogo_pedido_pendiente";
let cart = [];
try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { cart = []; }

function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {}
}

function cartTotal() {
  return cart.reduce((sum, item) => {
    const p = PRODUCTOS.find((x) => x.id === item.id);
    return p ? sum + p.precio * item.qty : sum;
  }, 0);
}

function addToCart(id, talle, qty) {
  const existing = cart.find((i) => i.id === id && i.talle === talle);
  if (existing) existing.qty += qty;
  else cart.push({ id, talle, qty });
  saveCart();
  renderCart();
  const badge = $("#cartCount");
  badge.classList.remove("bump");
  void badge.offsetWidth;
  badge.classList.add("bump");
}

function renderCart() {
  // descarta productos que ya no existen en el catálogo
  cart = cart.filter((i) => PRODUCTOS.some((p) => p.id === i.id));
  const count = cart.reduce((n, i) => n + i.qty, 0);
  $("#cartCount").textContent = count;
  $("#cartTotal").textContent = fmt(cartTotal());
  $("#checkoutBtn").disabled = cart.length === 0;
  $("#clearCart").hidden = cart.length === 0;

  const box = $("#cartItems");
  if (cart.length === 0) {
    box.innerHTML = `
      <div class="cart-empty">
        <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
        <p>Tu carrito está vacío</p>
      </div>`;
    return;
  }

  box.innerHTML = cart.map((item, idx) => {
    const p = PRODUCTOS.find((x) => x.id === item.id);
    return `
      <div class="cart-item">
        <img src="${p.img}" alt="${escapeHtml(p.nombre)}">
        <div>
          <p class="cart-item__name">${escapeHtml(p.nombre)}</p>
          <p class="cart-item__meta">Talle ${escapeHtml(item.talle)} · ${fmt(p.precio)}</p>
          <div class="qty qty--sm">
            <button data-dec="${idx}" aria-label="Restar">−</button>
            <span>${item.qty}</span>
            <button data-inc="${idx}" aria-label="Sumar">+</button>
          </div>
        </div>
        <div class="cart-item__right">
          <span class="cart-item__price">${fmt(p.precio * item.qty)}</span>
          <button class="cart-item__remove" data-remove="${idx}">Quitar</button>
        </div>
      </div>`;
  }).join("");
}

$("#cartItems").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.inc) cart[+b.dataset.inc].qty++;
  if (b.dataset.dec) {
    const i = +b.dataset.dec;
    cart[i].qty--;
    if (cart[i].qty <= 0) cart.splice(i, 1);
  }
  if (b.dataset.remove) cart.splice(+b.dataset.remove, 1);
  saveCart();
  renderCart();
});

$("#clearCart").addEventListener("click", () => {
  cart = [];
  saveCart();
  renderCart();
});

/* =========================================================
   CATÁLOGO
   ========================================================= */
let filtroCategoria = "todas";
let busqueda = "";

function renderCategories() {
  $("#categories").innerHTML = CATEGORIAS.map((c) => `
    <button class="category" data-cat="${c.id}">
      <div class="category__img"><img src="${c.img}" alt="${escapeHtml(c.nombre)}" loading="lazy"></div>
      <div class="category__body"><strong>${escapeHtml(c.nombre)}</strong><span>Ver más →</span></div>
    </button>`).join("");

  $("#filters").innerHTML = [{ id: "todas", nombre: "Todas" }, ...CATEGORIAS]
    .map((c) => `<button class="chip" data-filter="${c.id}">${escapeHtml(c.nombre)}</button>`).join("");
}

function renderProducts() {
  const q = busqueda.trim().toLowerCase();
  const list = PRODUCTOS.filter((p) =>
    (filtroCategoria === "todas" || p.categoria === filtroCategoria) &&
    (!q || p.nombre.toLowerCase().includes(q) || catName(p.categoria).toLowerCase().includes(q))
  );

  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.filter === filtroCategoria));
  $("#catalogSubtitle").textContent = filtroCategoria === "todas" ? "Todas las prendas" : catName(filtroCategoria);
  $("#emptyMsg").hidden = list.length > 0;

  $("#products").innerHTML = list.map((p) => `
    <article class="product">
      <div class="product__img" data-open="${p.id}">
        <img src="${p.img}" alt="${escapeHtml(p.nombre)}" loading="lazy">
        ${p.precioAnterior ? `<span class="badge">OFERTA</span>` : p.nuevo ? `<span class="badge badge--new">NUEVO</span>` : ""}
      </div>
      <div class="product__body">
        <span class="product__cat">${escapeHtml(catName(p.categoria))}</span>
        <h3 class="product__name" data-open="${p.id}">${escapeHtml(p.nombre)}</h3>
        <div class="product__price">
          <strong>${fmt(p.precio)}</strong>
          ${p.precioAnterior ? `<s>${fmt(p.precioAnterior)}</s>` : ""}
        </div>
        <button class="product__btn" data-open="${p.id}">Agregar al carrito</button>
      </div>
    </article>`).join("");
}

function setFilter(cat) {
  filtroCategoria = cat;
  renderProducts();
}

$("#categories").addEventListener("click", (e) => {
  const c = e.target.closest("[data-cat]");
  if (!c) return;
  setFilter(c.dataset.cat);
  $("#catalogo").scrollIntoView();
});

$("#filters").addEventListener("click", (e) => {
  const c = e.target.closest("[data-filter]");
  if (c) setFilter(c.dataset.filter);
});

$("#products").addEventListener("click", (e) => {
  const el = e.target.closest("[data-open]");
  if (el) openProduct(+el.dataset.open);
});

/* =========================================================
   MODAL DE PRODUCTO
   ========================================================= */
const productModal = $("#productModal");
let current = { producto: null, talle: null, qty: 1 };

function openProduct(id) {
  const p = PRODUCTOS.find((x) => x.id === id);
  current = { producto: p, talle: p.talles.length === 1 ? p.talles[0] : null, qty: 1 };
  $("#pmImg").src = p.img;
  $("#pmImg").alt = p.nombre;
  $("#pmCat").textContent = catName(p.categoria);
  $("#pmName").textContent = p.nombre;
  $("#pmPrice").textContent = fmt(p.precio);
  $("#pmDesc").textContent = p.descripcion;
  $("#pmQty").textContent = 1;
  renderSizes();
  openLayer(productModal);
}

function renderSizes() {
  $("#pmSizes").innerHTML = current.producto.talles
    .map((t) => `<button type="button" class="size ${t === current.talle ? "active" : ""}" data-size="${escapeHtml(t)}">${escapeHtml(t)}</button>`)
    .join("");
}

$("#pmSizes").addEventListener("click", (e) => {
  const b = e.target.closest("[data-size]");
  if (!b) return;
  current.talle = b.dataset.size;
  renderSizes();
});
$("#pmMinus").addEventListener("click", () => { current.qty = Math.max(1, current.qty - 1); $("#pmQty").textContent = current.qty; });
$("#pmPlus").addEventListener("click", () => { current.qty++; $("#pmQty").textContent = current.qty; });

$("#pmAdd").addEventListener("click", () => {
  if (!current.talle) { toast("Elegí un talle"); return; }
  addToCart(current.producto.id, current.talle, current.qty);
  closeLayer(productModal);
  toast(`${current.producto.nombre} agregado al carrito`);
});

/* =========================================================
   CARRITO (drawer) y CHECKOUT
   ========================================================= */
const drawer = $("#cartDrawer");
const checkoutModal = $("#checkoutModal");
const form = $("#checkoutForm");

$("#cartOpen").addEventListener("click", () => openLayer(drawer));
drawer.addEventListener("click", (e) => { if (e.target.closest("[data-close-cart]")) closeLayer(drawer); });

[productModal, checkoutModal].forEach((m) =>
  m.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeLayer(m); })
);

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const open = [checkoutModal, productModal, drawer].find((el) => !el.hidden);
  if (open) closeLayer(open);
});

function entrega() { return form.entrega.value; }
function costoEnvio() { return entrega() === "envio" ? CONFIG.costoEnvio : 0; }

function renderSummary() {
  const subtotal = cartTotal();
  const envio = costoEnvio();
  const envioTxt = entrega() === "retiro" ? "Sin costo" : envio > 0 ? fmt(envio) : "A coordinar";
  $("#checkoutSummary").innerHTML = `
    <div class="summary__row"><span>Productos (${cart.reduce((n, i) => n + i.qty, 0)})</span><span>${fmt(subtotal)}</span></div>
    <div class="summary__row"><span>${entrega() === "envio" ? "Envío" : "Retiro en local"}</span><span>${envioTxt}</span></div>
    <div class="summary__row summary__total"><span>Total</span><span>${fmt(subtotal + envio)}</span></div>`;
}

function toggleAddress() {
  $("#addressFields").hidden = entrega() !== "envio";
  renderSummary();
}

$("#checkoutBtn").addEventListener("click", () => {
  if (cart.length === 0) return;
  closeLayer(drawer);
  $("#formError").hidden = true;
  toggleAddress();
  openLayer(checkoutModal);
  form.nombre.focus();
});

form.addEventListener("change", (e) => { if (e.target.name === "entrega") toggleAddress(); });
form.addEventListener("input", (e) => e.target.classList.remove("invalid"));

function saveOrderDraft(data, mensaje) {
  try {
    localStorage.setItem(ORDER_DRAFT_KEY, JSON.stringify({
      createdAt: new Date().toISOString(), data, entrega: entrega(),
      cart: cart.map((item) => ({ ...item })), mensaje,
    }));
  } catch {}
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = {
    nombre: form.nombre.value.trim(),
    direccion: form.direccion.value.trim(),
    barrio: form.barrio.value.trim(),
    notas: form.notas.value.trim(),
  };

  const required = ["nombre", ...(entrega() === "envio" ? ["direccion", "barrio"] : [])];
  const missing = required.filter((k) => !data[k]);
  missing.forEach((k) => form[k].classList.add("invalid"));
  if (missing.length) {
    $("#formError").textContent = "Completá los campos obligatorios marcados.";
    $("#formError").hidden = false;
    form[missing[0]].focus();
    return;
  }

  const mensaje = buildMessage(data);
  saveOrderDraft(data, mensaje);
  window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(mensaje)}`, "_blank");
  $("#orderPending").hidden = false;
  $("#formError").hidden = true;
  toast("Pedido guardado. El carrito se conserva hasta que confirmes el envío.");
});

$("#confirmOrderSent").addEventListener("click", () => {
  cart = [];
  saveCart();
  try { localStorage.removeItem(ORDER_DRAFT_KEY); } catch {}
  renderCart();
  form.reset();
  $("#orderPending").hidden = true;
  closeLayer(checkoutModal);
  toast("Pedido marcado como enviado");
});

$("#retryWhatsapp").addEventListener("click", () => {
  try {
    const draft = JSON.parse(localStorage.getItem(ORDER_DRAFT_KEY));
    if (draft?.mensaje) window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(draft.mensaje)}`, "_blank");
  } catch { toast("No se pudo recuperar el pedido."); }
});

function buildMessage(d) {
  const subtotal = cartTotal();
  const envio = costoEnvio();
  const lineas = cart.map((item, i) => {
    const p = PRODUCTOS.find((x) => x.id === item.id);
    return `${i + 1}. ${p.nombre} — Talle ${item.talle} x${item.qty} = ${fmt(p.precio * item.qty)}`;
  });

  const partes = [
    `*Nuevo pedido — ${CONFIG.nombreTienda}*`,
    "",
    ...lineas,
    "",
    `Subtotal: ${fmt(subtotal)}`,
  ];

  if (entrega() === "envio") {
    partes.push(`Envío: ${envio > 0 ? fmt(envio) : "a coordinar"}`);
  }
  partes.push(`*TOTAL: ${fmt(subtotal + envio)}*`, "", `*Nombre:* ${d.nombre}`);

  if (entrega() === "envio") {
    partes.push("*Entrega:* Envío a domicilio", `*Dirección:* ${d.direccion}`, `*Barrio:* ${d.barrio}`);
  } else {
    partes.push("*Entrega:* Retiro en el local");
  }
  if (d.notas) partes.push(`*Notas:* ${d.notas}`);

  return partes.join("\n");
}

/* =========================================================
   HEADER: menú móvil y búsqueda
   ========================================================= */
$("#menuToggle").addEventListener("click", () => $("#nav").classList.toggle("open"));
$("#nav").addEventListener("click", (e) => { if (e.target.tagName === "A") $("#nav").classList.remove("open"); });

$("#searchToggle").addEventListener("click", () => {
  const bar = $("#searchbar");
  bar.classList.toggle("open");
  if (bar.classList.contains("open")) $("#searchInput").focus();
});

$("#searchInput").addEventListener("input", (e) => {
  busqueda = e.target.value;
  if (busqueda && filtroCategoria !== "todas") filtroCategoria = "todas";
  renderProducts();
});
$("#searchInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#catalogo").scrollIntoView();
});

// imágenes que no cargan muestran un fondo suave
document.addEventListener("error", (e) => {
  if (e.target.tagName === "IMG") e.target.classList.add("img-fallback");
}, true);

/* =========================================================
   INICIO
   ========================================================= */
async function iniciar() {
  try {
    const catalogo = await cargarCatalogo();
    CONFIG = catalogo.config;
    CATEGORIAS = catalogo.categorias;
    PRODUCTOS = catalogo.productos;
    $("#year").textContent = new Date().getFullYear();
    $("#footerWhatsapp").textContent = `WhatsApp: +${CONFIG.whatsapp}`;
    $("#footerAddress").textContent = CONFIG.direccionLocal;
    $("#pickupNote").textContent = CONFIG.direccionLocal;
    $("#shipNote").textContent = CONFIG.costoEnvio > 0 ? `Costo: ${fmt(CONFIG.costoEnvio)}` : "Costo a coordinar";
    $("#orderPending").hidden = !localStorage.getItem(ORDER_DRAFT_KEY);
    renderCategories();
    renderProducts();
    renderCart();
  } catch (error) {
    $("#products").innerHTML = `<p class="catalog-error">${escapeHtml(error.message)} Volvé a intentar en unos minutos.</p>`;
    $("#emptyMsg").hidden = true;
    console.error(error);
  }
}

iniciar();
