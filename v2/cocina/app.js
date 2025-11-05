<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <title>Cocina — Seven de Burgers</title>
  <link rel="icon" href="../favicon.ico">
  <link rel="stylesheet" href="../shared/styles.css">
  <style>
    :root{ --bg:#0b1220; --card:#0f182a; --panel:#131f33; --muted:#a6b2c7; --chip:#192840; }
    body{ background:var(--bg); color:#e8f0ff; font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
    .wrap{ max-width:1280px; margin:10px auto; padding:0 10px; }
    .k-columns{ display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; contain:layout; }
    @media (max-width:1000px){ .k-columns{ grid-template-columns:1fr; } }
    .k-col{ background:var(--panel); border:1px solid rgba(255,255,255,.08); border-radius:14px; padding:10px; contain:layout paint; min-height:40vh; }
    .k-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:6px }
    .k-list{ display:grid; gap:8px; }
    .order{ background:var(--card); border:1px solid rgba(255,255,255,.08); border-radius:12px; padding:10px; }
    .row{ display:flex; gap:8px; align-items:center; }
    .muted{ color:var(--muted); font-size:.9rem; }
    .tag{ background:#1e2b45; padding:.1rem .5rem; border-radius:999px; font-size:.8rem }
    .btn.small{ padding:.35rem .6rem; border-radius:10px }
    .btn.danger{ background:#6b1111; }
    .btn.ghost{ background:transparent; border:1px dashed rgba(255,255,255,.25); }
    .price{ margin-left:auto; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="k-head">
      <h1 style="margin:0">Cocina</h1>
      <div class="muted" id="statusMsg">Modo online</div>
    </div>

    <div class="k-columns">
      <section class="k-col" id="colPENDING">
        <div class="k-head"><h3>Pendientes</h3><span class="tag" id="cntPENDING">0</span></div>
        <div class="k-list" id="listPENDING"></div>
      </section>

      <section class="k-col" id="colINPROGRESS">
        <div class="k-head"><h3>En cocina</h3><span class="tag" id="cntIN_PROGRESS">0</span></div>
        <div class="k-list" id="listIN_PROGRESS"></div>
      </section>

      <section class="k-col" id="colREADY">
        <div class="k-head"><h3>Listos</h3><span class="tag" id="cntREADY">0</span></div>
        <div class="k-list" id="listREADY"></div>
      </section>

      <section class="k-col" id="colDELIVERED">
        <div class="k-head"><h3>Entregados</h3><span class="tag" id="cntDELIVERED">0</span></div>
        <div class="k-list" id="listDELIVERED"></div>
      </section>
    </div>
  </div>

  <!-- ÚNICO script -->
  <script type="module" src="./app.js?v=20251105"></script>
</body>
</html>
