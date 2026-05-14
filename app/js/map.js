const OFFENDERS_DATA_URL = "/data/offenders.json";
const REGISTRY_BASE_URL = "https://www.iowasexoffender.gov";

const map = L.map("map", {
  scrollWheelZoom: true,
  preferCanvas: true,
});

const markerLayer = L.markerClusterGroup({
  chunkedLoading: true,
  chunkInterval: 100,
  chunkDelay: 40,
  maxClusterRadius: 55,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  removeOutsideVisibleBounds: true,
});

markerLayer.addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

loadOffenders();

async function loadOffenders() {
  try {
    const response = await fetch(OFFENDERS_DATA_URL);

    if (!response.ok) {
      throw new Error(`Could not load ${OFFENDERS_DATA_URL}. Status: ${response.status}`);
    }

    const offenders = await response.json();
    const validOffenders = offenders.filter(hasValidCoordinates);

    updateCount(validOffenders.length);
    addMarkers(validOffenders);

    if (validOffenders.length > 0) {
      map.fitBounds(markerLayer.getBounds(), {
        padding: [45, 45],
        maxZoom: 13,
      });
    } else {
      map.setView([41.878, -93.0977], 7);
      showMapError("No offenders with valid latitude and longitude were found.");
    }
  } catch (error) {
    console.error(error);
    map.setView([41.878, -93.0977], 7);
    showMapError(error.message);
  }
}

function addMarkers(offenders) {
  const markers = offenders.map((offender) => {
    const marker = L.marker([Number(offender.lat), Number(offender.lng)], {
      icon: getMarkerIcon(offender),
      title: offender.display_name || getFullName(offender),
    });

    marker.bindPopup(() => getPopupHtml(offender), {
      maxWidth: 320,
      closeButton: true,
    });

    return marker;
  });

  markerLayer.addLayers(markers);
}

function hasValidCoordinates(offender) {
  return (
    offender &&
    offender.lat !== null &&
    offender.lng !== null &&
    !Number.isNaN(Number(offender.lat)) &&
    !Number.isNaN(Number(offender.lng))
  );
}

function getMarkerIcon(offender) {
  const tierClass = getTierClass(offender.tier);
  const wantedClass = offender.wanted ? "wanted" : "";

  return L.divIcon({
    className: "",
    html: `<div class="custom-marker ${tierClass} ${wantedClass}"><span></span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32],
  });
}

function getPopupHtml(offender) {
  const name = escapeHtml(offender.display_name || getFullName(offender) || "Unknown Name");
  const photo = escapeAttribute(offender.photo || getFirstPhoto(offender) || "");
  const tierText = escapeHtml(getSimpleTier(offender.tier));
  const tierClass = getTierClass(offender.tier);
  const address = escapeHtml(offender.address || getFormattedAddress(offender) || "Address not listed");
  const wantedBadge = offender.wanted
    ? '<span class="badge wanted">WANTED</span>'
    : "";
  const registryUrl = escapeAttribute(getRegistryUrl(offender));

  return `
    <article class="popup-card">
      <div class="popup-header">
        <img
          class="popup-photo"
          src="${photo}"
          alt="${name}"
          loading="lazy"
          decoding="async"
          onerror="this.src='data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2272%22 height=%2272%22 viewBox=%220 0 72 72%22%3E%3Crect width=%2272%22 height=%2272%22 fill=%22%23e2e8f0%22/%3E%3Ctext x=%2236%22 y=%2239%22 text-anchor=%22middle%22 font-family=%22Arial%22 font-size=%2210%22 fill=%22%2364758b%22%3ENo Photo%3C/text%3E%3C/svg%3E';"
        />

        <div>
          <h2 class="popup-title">${name}</h2>
          <div class="badge-row">
            <span class="badge ${tierClass}">${tierText}</span>
            ${wantedBadge}
          </div>
        </div>
      </div>

      <div class="popup-body">
        <p class="popup-label">Address</p>
        <p class="popup-address">${address}</p>

        <a
          class="registry-link"
          href="${registryUrl}"
          target="_blank"
          rel="noopener noreferrer"
        >
          View Iowa Registry Page
        </a>
      </div>
    </article>
  `;
}

function getRegistryUrl(offender) {
  if (offender.registry_url) return offender.registry_url;
  if (offender.profile_url) return offender.profile_url;
  if (offender.detail_url) return offender.detail_url;

  const query = encodeURIComponent(
    offender.oci || offender.id || offender.display_name || getFullName(offender) || ""
  );

  return `${REGISTRY_BASE_URL}/registry/search?search=${query}`;
}

function getSimpleTier(tier) {
  if (!tier) return "Tier Unknown";
  const match = String(tier).match(/Tier\s*[123]/i);
  return match ? match[0].replace(/\s+/, " ") : tier;
}

function getTierClass(tier) {
  const normalized = String(tier || "").toLowerCase();

  if (normalized.includes("tier 1")) return "tier-one";
  if (normalized.includes("tier 2")) return "tier-two";
  if (normalized.includes("tier 3")) return "tier-three";

  return "tier-one";
}

function getFullName(offender) {
  return [offender.first_name, offender.middle_name, offender.last_name, offender.suffix]
    .filter(Boolean)
    .join(" ");
}

function getFirstPhoto(offender) {
  return Array.isArray(offender.photos) && offender.photos.length > 0
    ? offender.photos[0]
    : "";
}

function getFormattedAddress(offender) {
  return [
    offender.line_1,
    offender.line_2,
    offender.city,
    offender.state,
    offender.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
}

function updateCount(count) {
  const countElement = document.getElementById("offenderCount");
  if (countElement) countElement.textContent = count;
}

function showMapError(message) {
  const shell = document.querySelector(".page-shell");
  const errorBox = document.createElement("div");

  errorBox.className = "error-box";
  errorBox.textContent = message;

  shell.appendChild(errorBox);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}