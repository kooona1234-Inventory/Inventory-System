const SUPABASE_URL = "https://hmfvwasyndocjivyoycd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtZnZ3YXN5bmRvY2ppdnlveWNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MTAwNzksImV4cCI6MjEwMTE4NjA3OX0.pOSt9KhadNir22ti5ID3vzaxy_RZCUxy5YXGUm_EUeM";

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
  refreshBtn: document.getElementById("refreshBtn"),
};

let reads = [];

function setLive(state, text) {
  els.liveStatus.classList.remove("online", "error");
  if (state) els.liveStatus.classList.add(state);
  els.liveText.textContent = text;
}

function rssiClass(rssi) {
  if (rssi == null) return "mid";
  if (rssi > -50) return "good";
  if (rssi > -65) return "mid";
  return "weak";
}

function formatTime(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
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
    return;
  }

  els.lastRssi.textContent = `${latest.rssi ?? "—"} dBm`;
  els.latestEpc.textContent = latest.epc;
  els.latestMeta.textContent = `${latest.device_id || "جهاز غير معروف"} · ${formatTime(latest.created_at)}`;
}

function renderTable(highlightId) {
  if (!reads.length) {
    els.readsBody.innerHTML =
      '<tr class="empty-row"><td colspan="4">لا توجد قراءات بعد</td></tr>';
    updateStats();
    return;
  }

  els.readsBody.innerHTML = reads
    .map((row) => {
      const cls = row.id === highlightId ? "new-row" : "";
      const rssi = row.rssi == null ? "—" : `${row.rssi} dBm`;
      return `
        <tr class="${cls}" data-id="${row.id}">
          <td class="epc-cell">${row.epc}</td>
          <td class="rssi ${rssiClass(row.rssi)}">${rssi}</td>
          <td>${row.device_id || "—"}</td>
          <td>${formatTime(row.created_at)}</td>
        </tr>
      `;
    })
    .join("");

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
  renderTable(highlight ? row.id : null);
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
  renderTable();
  setLive("online", "متصل مباشرة");
}

function subscribeRealtime() {
  const channel = supabaseClient
    .channel("tag_reads_live")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "tag_reads" },
      (payload) => {
        upsertRead(payload.new, { prepend: true, highlight: true });
        setLive("online", "متصل مباشرة");
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setLive("online", "متصل مباشرة");
      } else if (status === "CHANNEL_ERROR") {
        setLive("error", "خطأ في القناة المباشرة");
      } else if (status === "TIMED_OUT") {
        setLive("error", "انتهت مهلة الاتصال");
      }
    });

  return channel;
}

els.refreshBtn.addEventListener("click", () => {
  setLive(null, "جارٍ التحديث...");
  loadReads();
});

loadReads();
subscribeRealtime();
