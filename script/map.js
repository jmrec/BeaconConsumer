let simpleMap;
let currentMarkers = [];
let allReports = [];
let userBarangay = null;

// ==============================
// 1. Wait for Supabase Connection
// ==============================
async function waitForSupabase() {
  let retries = 0;
  while ((!window.supabase || typeof window.supabase.from !== "function") && retries < 30) {
    await new Promise((r) => setTimeout(r, 200));
    retries++;
  }
  if (!window.supabase || typeof window.supabase.from !== "function") {
    console.error("❌ Supabase failed to initialize.");
    throw new Error("Supabase not ready");
  }
}

// ==============================
// 2. Initialize Map
// ==============================
async function initSimpleMap() {
  // Initialize Map View
  simpleMap = L.map('map').setView([16.4142, 120.5950], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(simpleMap);

  // Wait for DB
  await waitForSupabase();

  // Load User Profile (needed for highlighting)
  await loadUserProfile();
  
  // Load Reports and Plot Markers
  await loadAndPlotReports();
  
  setupAreaFilter();
  setupSearch();
  
  // Handle Redirects (View on Map button)
  const urlParams = new URLSearchParams(window.location.search);
  const focusId = urlParams.get('id');
  
  if (focusId) {
      // CASE A: User clicked "View on Map" from Dashboard -> Open Modal & Zoom
      handleIncomingRedirect(focusId);
  } else {
      // CASE B: User clicked "Map" tab -> Just Zoom & Highlight (No Modal)
      if (userBarangay && userBarangay !== 'Not set') {
        checkUserBarangayOutage();
      }
  }
}

// ==============================
// 3. Helper: Zoom to User Area & Highlight (No Modal)
// ==============================
function checkUserBarangayOutage() {
  const affectedReports = allReports.filter(report => {
    if (report.areas_affected && Array.isArray(report.areas_affected)) {
      return report.areas_affected.some(area => 
        area.toLowerCase().includes(userBarangay.toLowerCase()) ||
        userBarangay.toLowerCase().includes(area.toLowerCase())
      );
    }
    return false;
  });

  if (affectedReports.length > 0) {
    // Get the most recent relevant report
    const report = affectedReports[0];
    const lat = Number(report.latitude);
    const lng = Number(report.longitude);
    
    if (!isNaN(lat) && !isNaN(lng)) {
      // 1. Center Map
      simpleMap.setView([lat, lng], 16);
      
      // 2. Highlight the marker (Blue Pulse)
      highlightUserRelevantMarker();
    }
  } else {
    showNoOutageNotification();
  }
}

// ==============================
// 4. Helper: Handle Redirect (Opens Modal)
// ==============================
function handleIncomingRedirect(id) {
    const targetMarker = currentMarkers.find(marker => marker.reportData.id == id);

    if (targetMarker) {
        const latLng = targetMarker.getLatLng();
        simpleMap.setView(latLng, 18); 
        
        // Simulate click to open modal
        setTimeout(() => {
            targetMarker.fire('click');
        }, 500); 
    } else {
        console.warn(`Marker for Announcement ID ${id} not found on map.`);
    }
}

// ==============================
// 5. Load User Profile
// ==============================
async function loadUserProfile() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data, error } = await supabase
        .from('profiles')
        .select('barangay')
        .eq('id', user.id)
        .single();
      
      if (!error && data) {
        userBarangay = data.barangay;
      }
    }
  } catch (err) {
    console.error('Error loading user profile:', err);
  }
}

// ==============================
// 6. Load and Plot Reports (Main Logic)
// ==============================
async function loadAndPlotReports(feederFilter = null) {
  try {
    let query = supabase
      .from('announcements')
      .select('*')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .in('status', ['Reported', 'Ongoing'])
      .order('created_at', { ascending: false });

    if (feederFilter && feederFilter !== 'my-area') {
      const feederNumber = parseInt(feederFilter.replace('feeder-', ''));
      query = query.eq('feeder_id', feederNumber);
    }

    const { data, error } = await query;
    if (error) throw error;

    allReports = data;

    currentMarkers.forEach(marker => simpleMap.removeLayer(marker));
    currentMarkers = [];

    const coordinateGroups = {};
    data.forEach(report => {
      const lat = Number(report.latitude);
      const lng = Number(report.longitude);
      if (isNaN(lat) || isNaN(lng)) return;
      
      const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      if (!coordinateGroups[key]) coordinateGroups[key] = [];
      coordinateGroups[key].push(report);
    });

    Object.entries(coordinateGroups).forEach(([key, reports]) => {
      reports.forEach((report, index) => {
        const lat = Number(report.latitude);
        const lng = Number(report.longitude);
        
        const offsetDistance = 0.0003 * index; 
        const angle = (index * 137.5) * (Math.PI / 180); 
        const offsetLat = lat + (offsetDistance * Math.cos(angle));
        const offsetLng = lng + (offsetDistance * Math.sin(angle));

        const color = report.status === 'Ongoing' ? '#FFC107' : '#DC3545';
        const markerIcon = createCustomIcon(color);

        const marker = L.marker([offsetLat, offsetLng], {
          icon: markerIcon
        }).addTo(simpleMap);

        marker.on('click', () => {
          openModal(report);
        });

        marker.reportData = report;
        currentMarkers.push(marker);
      });
    });

    if (userBarangay) {
        highlightUserRelevantMarker();
    }

    if (currentMarkers.length > 0 && !window.location.search.includes('id=')) {
      const group = L.featureGroup(currentMarkers);
      simpleMap.fitBounds(group.getBounds().pad(0.1));
    }

  } catch (err) {
    console.error('Error loading reports:', err);
  }
}

// ==============================
// 7. Helper: Highlight User Relevant Marker (Blue Pulse)
// ==============================
function highlightUserRelevantMarker() {
    if (!userBarangay || userBarangay === 'Not set') return;

    // Find the most recent relevant marker
    const targetMarker = currentMarkers.find(m => {
        const r = m.reportData;
        const mainMatch = (r.barangay || '').toLowerCase().includes(userBarangay.toLowerCase());
        const areaMatch = Array.isArray(r.areas_affected) && 
                          r.areas_affected.some(area => area.toLowerCase().includes(userBarangay.toLowerCase()));
        return mainMatch || areaMatch;
    });

    if (targetMarker) {
        // Change Icon to Blue Pulse
        const blueIcon = createCustomIcon('#2196F3'); // Material Blue
        targetMarker.setIcon(blueIcon);
        
        // Bring to front so it's visible over others
        targetMarker.setZIndexOffset(1000);
    }
}

// ==============================
// 8. Helper: Icon Generator
// ==============================
function createCustomIcon(color) {
    return L.divIcon({
      className: 'custom-marker-icon',
      html: `
        <div class="marker-pin" style="background-color: ${color};">
          <div class="marker-pulse" style="background-color: ${color};"></div>
        </div>
        <div class="marker-shadow"></div>
      `,
      iconSize: [30, 42],
      iconAnchor: [15, 42],
      popupAnchor: [0, -42]
    });
}

// ==============================
// 9. Notification: No Outage Found
// ==============================
function showNoOutageNotification() {
  const notification = document.createElement('div');
  notification.className = 'no-outage-notification';
  notification.innerHTML = `
    <span class="material-symbols-outlined">check_circle</span>
    <span>No reported or ongoing outages in ${userBarangay}</span>
  `;
  document.body.appendChild(notification);
  
  setTimeout(() => notification.classList.add('show'), 100);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

// ==============================
// 10. Modal Logic
// ==============================
function openModal(report) {
  let modal = document.getElementById('announcementModal');
  if (!modal) {
    modal = createModal();
  }

  document.getElementById('modalTitle').textContent = report.cause || 'Power Outage';
  document.getElementById('modalStatus').textContent = report.status || 'Reported';
  document.getElementById('modalStatus').className = `modal-status status-${(report.status || 'Reported').toLowerCase()}`;
  
  document.getElementById('modalFeeder').textContent = report.feeder_id || 'N/A';
  
  const timeAnnounced = new Date(report.created_at);
  document.getElementById('modalTime').textContent = timeAnnounced.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  document.getElementById('modalLocation').textContent = report.location || report.barangay || 'Location not specified';
  
  const img = document.getElementById('modalImage');
  const imgContainer = document.getElementById('modalImageContainer');
  if (report.picture && report.picture.trim() !== '') {
    let imageUrl = report.picture;
    if (!imageUrl.startsWith('http')) {
      const { data: { publicUrl } } = supabase.storage
        .from('outage-pictures')
        .getPublicUrl(imageUrl);
      imageUrl = publicUrl;
    }
    img.src = imageUrl;
    img.onerror = () => { imgContainer.style.display = 'none'; };
    img.onload = () => { imgContainer.style.display = 'block'; };
    imgContainer.style.display = 'block';
  } else {
    imgContainer.style.display = 'none';
  }
  
  document.getElementById('modalDescription').textContent = report.description || 'No additional details available.';

  modal.style.display = 'flex';
}

function createModal() {
  const modal = document.createElement('div');
  modal.id = 'announcementModal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <div>
          <h2 id="modalTitle">Power Outage</h2>
          <span id="modalStatus" class="modal-status">Reported</span>
        </div>
        <button class="modal-close-btn">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="modal-body">
        <div class="modal-info-grid">
          <div class="modal-info-item">
            <span class="material-symbols-outlined">power</span>
            <div>
              <div class="modal-info-label">Feeder Number</div>
              <div class="modal-info-value" id="modalFeeder">N/A</div>
            </div>
          </div>
          <div class="modal-info-item">
            <span class="material-symbols-outlined">schedule</span>
            <div>
              <div class="modal-info-label">Time Announced</div>
              <div class="modal-info-value" id="modalTime">-</div>
            </div>
          </div>
          <div class="modal-info-item">
            <span class="material-symbols-outlined">location_on</span>
            <div>
              <div class="modal-info-label">Location</div>
              <div class="modal-info-value" id="modalLocation">-</div>
            </div>
          </div>
        </div>
        <div id="modalImageContainer" class="modal-image-container">
          <img id="modalImage" class="modal-image" alt="Outage Image">
        </div>
        <div class="modal-description">
          <h3>Description</h3>
          <p id="modalDescription">No details available.</p>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);

  const closeBtn = modal.querySelector('.modal-close-btn');
  closeBtn.onclick = () => modal.style.display = 'none';

  modal.onclick = (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  };

  return modal;
}

// ==============================
// 11. Filters & Search
// ==============================
function setupAreaFilter() {
  const areaSelector = document.getElementById('area-selector');
  if (areaSelector) {
    areaSelector.addEventListener('change', (e) => {
      const selectedArea = e.target.value;
      loadAndPlotReports(selectedArea === 'my-area' ? null : selectedArea);
    });
  }
}

async function setupSearch() {
  const searchInput = document.getElementById('locationSearch');
  const dropdown = document.getElementById('searchDropdown');
  
  if (searchInput) {
    const barangays = await loadBarangays();
    
    if (!dropdown) {
      const newDropdown = document.createElement('div');
      newDropdown.id = 'searchDropdown';
      newDropdown.className = 'search-dropdown';
      searchInput.parentNode.appendChild(newDropdown);
    }
    
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      filterBarangays(query, barangays);
    });
    
    searchInput.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (query) {
          await searchAffectedLocation(query);
          hideDropdown();
        }
      }
    });
    
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
        hideDropdown();
      }
    });
  }
}

async function loadBarangays() {
  try {
    const { data, error } = await supabase
      .from('barangays')
      .select('name')
      .order('name');
    
    if (error) throw error;
    return data.map(item => item.name);
  } catch (err) {
    console.error('Error loading barangays:', err);
    return [];
  }
}

function filterBarangays(query, barangays) {
  const dropdown = document.getElementById('searchDropdown');
  
  if (!query) {
    hideDropdown();
    return;
  }
  
  const filtered = barangays.filter(barangay => 
    barangay.toLowerCase().includes(query.toLowerCase())
  );
  
  if (filtered.length > 0) {
    dropdown.innerHTML = filtered.map(barangay => 
      `<div class="dropdown-item" data-barangay="${barangay}">${barangay}</div>`
    ).join('');
    dropdown.style.display = 'block';
    
    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const searchInput = document.getElementById('locationSearch');
        searchInput.value = item.getAttribute('data-barangay');
        searchAffectedLocation(item.getAttribute('data-barangay'));
        hideDropdown();
      });
    });
  } else {
    hideDropdown();
  }
}

function hideDropdown() {
  const dropdown = document.getElementById('searchDropdown');
  if (dropdown) {
    dropdown.style.display = 'none';
  }
}

async function searchAffectedLocation(query) {
  const queryLower = query.toLowerCase();
  
  const matchingReports = allReports.filter(report => {
    if (report.location && report.location.toLowerCase().includes(queryLower)) return true;
    if (report.barangay && report.barangay.toLowerCase().includes(queryLower)) return true;
    if (report.areas_affected && Array.isArray(report.areas_affected)) {
      return report.areas_affected.some(area => 
        area.toLowerCase().includes(queryLower)
      );
    }
    return false;
  });
  
  if (matchingReports.length > 0) {
    const report = matchingReports[0];
    const lat = Number(report.latitude);
    const lng = Number(report.longitude);
    
    if (!isNaN(lat) && !isNaN(lng)) {
      simpleMap.setView([lat, lng], 16);
      setTimeout(() => {
        openModal(report);
      }, 300);
    }
  } else {
    const notification = document.createElement('div');
    notification.className = 'search-notification';
    notification.innerHTML = `
      <span class="material-symbols-outlined">search_off</span>
      <span>No outages found for "${query}"</span>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('show');
    }, 100);
    
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

// ==============================
// 12. Startup
// ==============================
document.addEventListener('DOMContentLoaded', () => {
  initSimpleMap();
});

// ==============================
// 13. Styles Injection (Fixes Z-Index Issue)
// ==============================
const styles = document.createElement('style');
styles.textContent = `
  /* FIX MAP CONTAINER Z-INDEX (Prevents overlap on navbar) */
  #map {
    z-index: 0 !important;
    position: relative;
  }

  /* FORCE OVERLAYS TO BE ON TOP OF MAP CONTROLS */
  .modal-overlay, .modal { 
      z-index: 20000 !important; 
  }

  /* Map Controls - High but lower than modal */
  .map-controls {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 12px;
    flex-wrap: nowrap;
    position: relative;
    z-index: 1000; /* Lowered from 10002 to allow modal (20000) to sit on top */
  }

  .map-search-container {
    flex: 1;
    position: relative;
    min-width: 200px;
  }

  .map-search-input {
    width: 100%;
    padding: 10px 16px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }

  .map-search-input:focus {
    border-color: #4285f4;
  }

  /* Search Dropdown needs to be slightly above controls */
  .search-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: white;
    border: 1px solid #ddd;
    border-top: none;
    border-radius: 0 0 8px 8px;
    max-height: 200px;
    overflow-y: auto;
    z-index: 1001; /* Just above the map-controls (1000) */
    display: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .dropdown-item {
    padding: 10px 16px;
    cursor: pointer;
    border-bottom: 1px solid #f0f0f0;
    transition: background-color 0.2s;
  }

  .dropdown-item:hover {
    background-color: #f8f9fa;
  }

  .dropdown-item:last-child {
    border-bottom: none;
  }

  .map-area-selector {
    width: 48px;
    height: 40px;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 20px;
    cursor: pointer;
    background: white url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23333"><path d="M7 10l5 5 5-5z"/></svg>') no-repeat;
    background-position: center;
    background-size: 24px;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    outline: none;
    transition: border-color 0.2s, background-color 0.2s;
    text-indent: -9999px;
    flex-shrink: 0;
  }

  .map-area-selector:hover {
    background-color: #f8f9fa;
    border-color: #4285f4;
  }

  .map-area-selector:focus {
    border-color: #4285f4;
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .map-controls {
      flex-direction: row;
      flex-wrap: nowrap;
      gap: 8px;
    }
    
    .map-search-container {
      min-width: 150px;
    }
    
    .map-area-selector {
      width: 44px;
      height: 40px;
    }
  }

  @media (max-width: 480px) {
    .map-controls {
      gap: 6px;
    }
    
    .map-search-container {
      min-width: 120px;
    }
    
    .map-search-input {
      padding: 8px 12px;
      font-size: 13px;
    }
    
    .map-area-selector {
      width: 40px;
      height: 38px;
    }
  }

  /* Custom Marker Styling */
  .custom-marker-icon {
    background: transparent !important;
    border: none !important;
  }

  .marker-pin {
    position: relative;
    width: 30px;
    height: 30px;
    border-radius: 50% 50% 50% 0;
    background: #DC3545;
    transform: rotate(-45deg);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    border: 2px solid white;
    z-index: 1000;
  }

  .marker-pin::after {
    content: '';
    position: absolute;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: white;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .marker-pulse {
    position: absolute;
    width: 30px;
    height: 30px;
    border-radius: 50% 50% 50% 0;
    background: inherit;
    opacity: 0;
    animation: pulse 2s ease-out infinite;
  }

  @keyframes pulse {
    0% {
      transform: scale(1) rotate(-45deg);
      opacity: 0.8;
    }
    100% {
      transform: scale(1.8) rotate(-45deg);
      opacity: 0;
    }
  }

  .marker-shadow {
    position: absolute;
    top: 36px;
    left: 50%;
    transform: translateX(-50%);
    width: 20px;
    height: 6px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.2);
    filter: blur(2px);
  }

  /* Notifications */
  .no-outage-notification,
  .search-notification {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(-100px);
    background: white;
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    gap: 12px;
    z-index: 10001;
    transition: transform 0.3s ease;
  }

  .no-outage-notification.show,
  .search-notification.show {
    transform: translateX(-50%) translateY(0);
  }

  .no-outage-notification .material-symbols-outlined {
    color: #4caf50;
    font-size: 24px;
  }

  .search-notification .material-symbols-outlined {
    color: #ff9800;
    font-size: 24px;
  }

  /* MAP ANNOUNCEMENT MODAL - Set to 2000 (Above map/controls, below global modal) */
  .modal {
    display: none;
    position: fixed;
    z-index: 2000; 
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .modal-content {
    background-color: #fff;
    border-radius: 12px;
    max-width: 600px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 24px;
    border-bottom: 1px solid #e0e0e0;
  }

  .modal-header h2 {
    margin: 0 0 8px 0;
    font-size: 24px;
    font-weight: 500;
    color: #333;
  }

  .modal-status {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
  }

  .modal-status.status-reported {
    background-color: #ffebee;
    color: #c62828;
  }

  .modal-status.status-ongoing {
    background-color: #fff8e1;
    color: #f57c00;
  }

  .modal-close-btn {
    background: none;
    border: none;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #666;
    transition: background-color 0.2s, color 0.2s;
    padding: 0;
  }

  .modal-close-btn:hover {
    background-color: #f5f5f5;
    color: #333;
  }

  .modal-close-btn .material-symbols-outlined {
    font-size: 24px;
  }

  .modal-body {
    padding: 24px;
  }

  .modal-info-grid {
    display: grid;
    gap: 16px;
    margin-bottom: 24px;
  }

  .modal-info-item {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .modal-info-item .material-symbols-outlined {
    font-size: 24px;
    color: #666;
  }

  .modal-info-label {
    font-size: 12px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .modal-info-value {
    font-size: 16px;
    color: #333;
    font-weight: 500;
  }

  .modal-image-container {
    margin: 24px 0;
    text-align: center;
  }

  .modal-image {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .modal-description {
    margin-top: 24px;
  }

  .modal-description h3 {
    font-size: 16px;
    font-weight: 500;
    color: #333;
    margin: 0 0 12px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .modal-description p {
    font-size: 14px;
    line-height: 1.6;
    color: #666;
    margin: 0;
  }

  @media (max-width: 768px) {
    .modal-content {
      max-width: 100%;
      margin: 20px;
    }
  }
`;
document.head.appendChild(styles);