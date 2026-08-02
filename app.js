const SUPABASE_URL = "https://hmfvwasyndocjivyoycd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtZnZ3YXN5bmRvY2ppdnlveWNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MTAwNzksImV4cCI6MjEwMTE4NjA3OX0.pOSt9KhadNir22ti5ID3vzaxy_RZCUxy5YXGUm_EUeM";

const DEVICE_ACTIVE_MS = 45000;

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const els = {
  liveStatus: document.getElementById("liveStatus"),
  liveText: document.getElementById("liveText"),
  totalReads: document.getElementById("totalReads"),
  uniqueTags: document.getElementById("uniqueTags"),
  lastRssi: document.getElementById("lastRssi"),
  latestEpc: document.getElementById("latestEpc"),
  latestMeta: document.getElementById("latestMeta"),
  readsBody: document.getElementById("readsBody"),
  tagsBody: document.getElementById("tagsBody"),
  refreshBtn: document.getElementById("refreshBtn"),
  clearAllBtn: document.getElementById("clearAllBtn"),
  nameDialog: document.getElementById("nameDialog"),
  nameForm: document.getElementById("nameForm"),
  nameInput: document.getElementById("nameInput"),
  dialogEpc: document.getElementById("dialogEpc"),
  cancelNameBtn: document.getElementById("cancelNameBtn"),
};

let reads = [];
/** @type {Record<string, string>} */
let nameByEpc = {};
let editingEpc = null;
let lastDeviceSeenAt = null;
let realtimeReady = false;

function setLive(state, text) {
  els.liveStatus.classList.remove("online", "error", "idle");
  if (state) els.liveStatus.classList.add(state);
  els.liveText.textContent = text;
}

function refreshDeviceStatus() {
  if (!realtimeReady && !lastDeviceSeenAt) {
    setLive(null, "جارٍ الاتصال...");
    return;
  }

  const active =
    lastDeviceSeenAt != null &&
    Date.now() - lastDeviceSeenAt.getTime() <= DEVICE_ACTIVE_MS;

  if (active) {
    setLive("online", "الجهاز متصل");
  } else {
    setLive("idle", "الجهاز غير متصل");
  }
}

function noteDeviceActivity(iso) {
  if (!iso) return;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return;
  if (!lastDeviceSeenAt || at > lastDeviceSeenAt) {
    lastDeviceSeenAt = at;
  }
  refreshDeviceStatus();
}

function formatRssi(rssi) {
  return rssi == null ? "—" : String(rssi);
}

function formatTime(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function displayName(epc) {
  return nameByEpc[epc] || "بدون اسم";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function updateStats() {
  els.totalReads.textContent = String(reads.length);
  const unique = new Set(reads.map((r) => r.epc));
  els.uniqueTags.textContent = String(unique.size);

  const latest = reads[0];
  if (!latest) {
    els.lastRssi.textContent = "—";
    els.latestEpc.textContent = "بانتظار أول قراءة...";
    els.latestMeta.textContent = "";
    refreshDeviceStatus();
    return;
  }

  els.lastRssi.textContent = formatRssi(latest.rssi);
  els.latestEpc.textContent = `${displayName(latest.epc)} · ${latest.epc}`;
  els.latestMeta.textContent = formatTime(latest.created_at);
  noteDeviceActivity(latest.created_at);
}

function uniqueTagRows() {
  const map = new Map();
  for (const row of reads) {
    if (!map.has(row.epc)) map.set(row.epc, row);
  }
  return [...map.values()];
}

function renderTags() {
  const rows = uniqueTagRows();
  if (!rows.length) {
    els.tagsBody.innerHTML =
      '<tr class="empty-row"><td colspan="4">لا توجد تاقات بعد</td></tr>';
    return;
  }

  els.tagsBody.innerHTML = rows
    .map((row) => {
      const name = displayName(row.epc);
      return `
        <tr data-epc="${escapeHtml(row.epc)}">
          <td><strong>${escapeHtml(name)}</strong></td>
          <td class="epc-cell">${escapeHtml(row.epc)}</td>
          <td class="rssi-green mono">${escapeHtml(formatRssi(row.rssi))}</td>
          <td>
            <button type="button" class="ghost-btn small-btn" data-action="rename" data-epc="${escapeHtml(row.epc)}">تعديل الاسم</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderTable(highlightId) {
  if (!reads.length) {
    els.readsBody.innerHTML =
      '<tr class="empty-row"><td colspan="5">لا توجد قراءات بعد</td></tr>';
    renderTags();
    updateStats();
    return;
  }

  els.readsBody.innerHTML = reads
    .map((row) => {
      const cls = row.id === highlightId ? "new-row" : "";
      return `
        <tr class="${cls}" data-id="${row.id}">
          <td>${escapeHtml(displayName(row.epc))}</td>
          <td class="epc-cell">${escapeHtml(row.epc)}</td>
          <td class="rssi-green mono">${escapeHtml(formatRssi(row.rssi))}</td>
          <td class="time-en">${formatTime(row.created_at)}</td>
          <td>
            <div class="row-actions">
              <button type="button" class="ghost-btn small-btn" data-action="rename" data-epc="${escapeHtml(row.epc)}">تعديل</button>
              <button type="button" class="danger-btn small-btn" data-action="delete-one" data-id="${row.id}">حذف</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  renderTags();
  updateStats();
}

function upsertRead(row, { prepend = false, highlight = false } = {}) {
  const idx = reads.findIndex((r) => r.id === row.id);
  if (idx !== -1) {
    reads[idx] = row;
  } else if (prepend) {
    reads.unshift(row);
  } else {
    reads.push(row);
  }

  reads.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (reads.length > 200) reads = reads.slice(0, 200);
  noteDeviceActivity(row.created_at);
  renderTable(highlight ? row.id : null);
}

async function loadNames() {
  const { data, error } = await supabaseClient
    .from("tags")
    .select("epc,product_name");

  if (error) {
    console.error(error);
    return;
  }

  nameByEpc = {};
  for (const row of data || []) {
    if (row.epc) nameByEpc[row.epc] = row.product_name || "";
  }
}

async function loadReads() {
  const { data, error } = await supabaseClient
    .from("tag_reads")
    .select("id,epc,rssi,device_id,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error(error);
    setLive("error", "تعذر جلب البيانات");
    return;
  }

  reads = data || [];
  if (reads[0]?.created_at) noteDeviceActivity(reads[0].created_at);
  renderTable();
  refreshDeviceStatus();
}

async function refreshAll() {
  setLive(null, "جارٍ التحديث...");
  await loadNames();
  await loadReads();
}

function openRenameDialog(epc) {
  editingEpc = epc;
  els.dialogEpc.textContent = epc;
  els.nameInput.value = nameByEpc[epc] || "";
  els.nameDialog.showModal();
  els.nameInput.focus();
}

async function saveTagName(epc, productName) {
  const { error } = await supabaseClient.from("tags").upsert(
    {
      epc,
      product_name: productName,
      status: "active",
    },
    { onConflict: "epc" }
  );

  if (error) {
    console.error(error);
    alert("تعذر حفظ الاسم: " + error.message);
    return false;
  }

  nameByEpc[epc] = productName;
  renderTable();
  return true;
}

async function deleteOneRead(id) {
  const { error } = await supabaseClient.from("tag_reads").delete().eq("id", id);
  if (error) {
    console.error(error);
    alert("تعذر الحذف: " + error.message);
    return;
  }
  reads = reads.filter((r) => r.id !== id);
  renderTable();
}

async function clearAllReads() {
  const ok = confirm("هل تريد حذف كل القراءات من قاعدة البيانات؟");
  if (!ok) return;

  const { error } = await supabaseClient
    .from("tag_reads")
    .delete()
    .neq("id", 0);

  if (error) {
    console.error(error);
    alert("تعذر حذف القراءات: " + error.message);
    return;
  }

  reads = [];
  lastDeviceSeenAt = null;
  renderTable();
  refreshDeviceStatus();
}

function subscribeRealtime() {
  supabaseClient
    .channel("inventory_live")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "tag_reads" },
      (payload) => {
        upsertRead(payload.new, { prepend: true, highlight: true });
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "tag_reads" },
      (payload) => {
        const id = payload.old?.id;
        if (id == null) return;
        reads = reads.filter((r) => r.id !== id);
        renderTable();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tags" },
      (payload) => {
        const row = payload.new || payload.old;
        if (!row?.epc) return;
        if (payload.eventType === "DELETE") {
          delete nameByEpc[row.epc];
        } else {
          nameByEpc[row.epc] = row.product_name || "";
        }
        renderTable();
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        realtimeReady = true;
        refreshDeviceStatus();
      } else if (status === "CHANNEL_ERROR") {
        realtimeReady = false;
        setLive("error", "خطأ في القناة المباشرة");
      } else if (status === "TIMED_OUT") {
        realtimeReady = false;
        setLive("error", "انتهت مهلة الاتصال");
      }
    });
}

els.refreshBtn.addEventListener("click", refreshAll);
els.clearAllBtn.addEventListener("click", clearAllReads);

els.cancelNameBtn.addEventListener("click", () => {
  els.nameDialog.close();
  editingEpc = null;
});

els.nameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!editingEpc) return;
  const name = els.nameInput.value.trim();
  if (!name) return;
  const saved = await saveTagName(editingEpc, name);
  if (saved) {
    els.nameDialog.close();
    editingEpc = null;
  }
});

document.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  if (action === "rename") {
    openRenameDialog(btn.dataset.epc);
  } else if (action === "delete-one") {
    const id = Number(btn.dataset.id);
    if (!Number.isFinite(id)) return;
    if (confirm("حذف هذه القراءة من القاعدة؟")) deleteOneRead(id);
  }
});

setInterval(refreshDeviceStatus, 5000);

refreshAll();
subscribeRealtime();
