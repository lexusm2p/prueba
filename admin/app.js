// /admin/app.js con CRUD de Artículos
import {
  getOrdersRange,
  subscribeInventory,
  subscribeProducts,
  subscribeSuppliers,
  recordPurchase,
  upsertSupplier,
  setHappyHour,
  subscribeHappyHour,
  upsertInventoryItem,
  subscribeRecipes,
  produceBatch,
  adjustStock,
  subscribeSettings,
  fetchCatalogWithFallback,
  subscribeArticles,
  upsertArticle,
  deleteArticle
} from '../shared/db.js';
import { toast } from '../shared/notify.js';

// ... tu código de pestañas, reportes, inventario, compras, proveedores, productos, happy hour y recetario permanece igual ...

// ============== ARTÍCULOS ==============
let ARTICLES = [];
subscribeArticles(arr => {
  ARTICLES = arr || [];
  renderArticles();
});

function renderArticles() {
  const tb = q('#tblArticles tbody');
  tb.innerHTML = ARTICLES.map(a => `
    <tr>
      <td>${esc(a.name)}</td>
      <td>${esc(a.desc || '')}</td>
      <td class="right">
        <button class="btn small ghost" data-id="${a.id}" data-a="edit">✏️</button>
        <button class="btn small ghost" data-id="${a.id}" data-a="del">🗑️</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="3">—</td></tr>';
}

document.getElementById('btnNewArticle')?.addEventListener('click', () => openArticleModal());

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-a]');
  if (!btn || !btn.dataset.id) return;
  const id = btn.dataset.id;
  const a = ARTICLES.find(x => x.id === id);
  if (btn.dataset.a === 'edit') openArticleModal(a);
  if (btn.dataset.a === 'del') confirmDeleteArticle(a);
});

function openArticleModal(article = {}) {
  const name = prompt('Nombre del artículo:', article.name || '');
  if (!name) return;
  const desc = prompt('Descripción:', article.desc || '');
  upsertArticle({ ...article, name, desc }).then(() => toast('Artículo guardado'));
}

function confirmDeleteArticle(article) {
  if (!article || !confirm(`¿Eliminar artículo "${article.name}"?`)) return;
  deleteArticle(article.id).then(() => toast('Artículo eliminado'));
}

// ---------------- helpers ----------------
function q(sel){ return document.querySelector(sel); }
function setTxt(id,v){ const el=document.getElementById(id); if(el) el.textContent=String(v); }
function setMoney(id,v){ const el=document.getElementById(id); if(el) el.textContent=fmtMoney(v); }
const fmtMoney = n => '$' + Number(n||0).toFixed(0);
function esc(s=''){
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[m]));
}

runReports();