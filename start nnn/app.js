const SUPABASE_URL = "https://ialbnqqeviddjrifnpby.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_UVoNy33CzeFMZY2tTo72bw_LhT_cQyX";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const ALERT_DISTANCE_M = 500;
const LOCAL_STORAGE_KEY = "roadai_local_defects_v1";

const map = L.map("map").setView([42.3417, 69.5901], 14);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

let userPos = null;
let userMarker = null;
const renderedIds = new Set();
const alertedIds = new Set();
let defects = [];

const statusEl = document.getElementById("status");
const alertBox = document.getElementById("alertBox");
const defectInput = document.getElementById("defectInput");

function loadLocalDefects() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalDefects(list) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function addMarkerToMap(d) {
  if (!d || d.id == null || renderedIds.has(d.id)) return;
  renderedIds.add(d.id);
  L.marker([d.lat, d.lng])
    .addTo(map)
    .bindPopup(`<b>${d.title}</b><br>Координата: ${Number(d.lat).toFixed(5)}, ${Number(d.lng).toFixed(5)}`);
}

async function loadDefects() {
  const localItems = loadLocalDefects();
  if (localItems.length) {
    defects = localItems;
    defects.forEach(addMarkerToMap);
    checkProximity();
  }

  const { data, error } = await db.from("defects").select("*");
  if (error) {
    console.warn("Supabase оқу ескертпесі:", error.message);
    return;
  }

  if (Array.isArray(data)) {
    const mergedMap = new Map();
    [...localItems, ...data].forEach((item) => {
      if (item && item.id != null) mergedMap.set(item.id, item);
    });
    defects = Array.from(mergedMap.values());
    defects.forEach(addMarkerToMap);
    checkProximity();
  }
}

function triggerAlert(text) {
  alertBox.style.display = "block";
  alertBox.textContent = text;
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = "kk-KZ";
    window.speechSynthesis.speak(msg);
  }
}

function checkProximity() {
  if (!userPos) return;
  let nearestAlert = "";

  defects.forEach((d) => {
    const dist = distanceMeters(userPos.lat, userPos.lng, d.lat, d.lng);
    if (dist <= ALERT_DISTANCE_M) {
      nearestAlert = `Ескерту! Алда ${Math.round(dist)} метрде ақау бар: ${d.title}`;
      if (!alertedIds.has(d.id)) {
        alertedIds.add(d.id);
        triggerAlert(nearestAlert);
      }
    }
  });

  if (!nearestAlert) {
    alertBox.style.display = "none";
  }
}

document.getElementById("locateBtn").addEventListener("click", () => {
  if (!navigator.geolocation) {
    statusEl.textContent = "Браузер GPS қолдамайды";
    return;
  }
  navigator.geolocation.watchPosition(
    (pos) => {
      userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      statusEl.textContent = `GPS: ${userPos.lat.toFixed(5)}, ${userPos.lng.toFixed(5)}`;
      if (!userMarker) {
        userMarker = L.circleMarker([userPos.lat, userPos.lng], {
          radius: 8,
          color: "#2563eb",
          fillColor: "#60a5fa",
          fillOpacity: 0.9
        }).addTo(map).bindPopup("Сіздің орныңыз");
        map.setView([userPos.lat, userPos.lng], 15);
      } else {
        userMarker.setLatLng([userPos.lat, userPos.lng]);
      }
      checkProximity();
    },
    (err) => {
      statusEl.textContent = `GPS қатесі: ${err.message}`;
    },
    { enableHighAccuracy: false, timeout: 10000 }
  );
});

document.getElementById("addDefectBtn").addEventListener("click", async () => {
  const title = defectInput.value.trim() || "Жол ақауы";
  const target = userPos || map.getCenter();

  const { data, error } = await db
    .from("defects")
    .insert([{ title, lat: target.lat, lng: target.lng }])
    .select();

  if (error) {
    const fallbackItem = {
      id: "local_" + Date.now(),
      title,
      lat: target.lat,
      lng: target.lng
    };
    const updated = [...loadLocalDefects(), fallbackItem];
    saveLocalDefects(updated);
    defects.push(fallbackItem);
    addMarkerToMap(fallbackItem);
    defectInput.value = "";
    checkProximity();
    alert("Базаға байланыс болмады, нүкте уақытша браузерге сақталды: " + error.message);
    return;
  }

  if (data && data[0]) {
    defects.push(data[0]);
    addMarkerToMap(data[0]);
    defectInput.value = "";
    checkProximity();
  }
});

loadDefects();
setInterval(loadDefects, 5000);