/*
================================================================================
Main Application Logic (dashboard.js)
================================================================================
Handles Supabase initialization, auth, user reports, and 
the public announcements dashboard.
*/

// ==============================
// Wait for Supabase Initialization
// ==============================
async function waitForSupabase() {
    let retries = 0;
    while ((!window.supabase || typeof window.supabase.from !== "function") && retries < 30) {
        await new Promise((r) => setTimeout(r, 200));
        retries++;
    }
    if (!window.supabase || typeof window.supabase.from !== "function") {
    console.error("❌ Supabase failed to initialize after waiting.");
        throw new Error("Supabase not ready");
    }
  console.log("✅ Supabase is ready");
}

// ==============================
// Populate Barangay Dropdown
// ==============================
async function loadBarangays() {
    const barangaySelect = document.getElementById("barangay-select");
    if (!barangaySelect) return;

    barangaySelect.innerHTML = `<option value="">Loading barangays...</option>`;

    try {
        await waitForSupabase();
        const { data, error } = await supabase.from("barangays").select("*").order("name", { ascending: true });
        if (error) throw error;

        barangaySelect.innerHTML = `<option value="">Select Barangay</option>`;
        data.forEach((barangay) => {
            const option = document.createElement("option");
            option.value = barangay.id;
            option.textContent = barangay.name;
            barangaySelect.appendChild(option);
        });
    console.log("✅ Barangays loaded:", data.length);
    } catch (err) {
    console.error("Error loading barangays:", err);
        barangaySelect.innerHTML = `<option value="">Failed to load</option>`;
    }
}

// ==============================
// Initialize Report Page
// ==============================
let reportSubscriptionChannel = null; 
let dashboardSubscriptionChannel = null; 

document.addEventListener("DOMContentLoaded", async () => {
  await waitForSupabase();
  await loadBarangays();
  
  setupCloseButtons();
  
  // Prevent dashboard logic from running if we are on the map page
  if (document.getElementById('map')) return;

  showPage('dashboard'); 
  
  // Listen for authentication changes
  supabase.auth.onAuthStateChange((event, session) => {
    console.log("Auth event:", event);
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      loadUserReports(); 
      if(session?.user?.id) {
        subscribeToReportUpdates(session.user.id);
      }
      if (document.getElementById('dashboard').classList.contains('active')) {
        loadDashboardAnnouncements();
      }
    } else if (event === 'SIGNED_OUT') {
      const container = document.getElementById("user-reports-container");
      if (container) {
          container.innerHTML = `<p>Please log in to see your reports.</p>`;
      }
      if (reportSubscriptionChannel) {
        supabase.removeChannel(reportSubscriptionChannel);
        reportSubscriptionChannel = null;
        console.log("📡 Unsubscribed from report updates.");
      }
      if (dashboardSubscriptionChannel) {
        supabase.removeChannel(dashboardSubscriptionChannel);
        dashboardSubscriptionChannel = null;
        console.log("📡 Unsubscribed from dashboard updates.");
      }
      if (document.getElementById('dashboard').classList.contains('active')) {
        loadDashboardAnnouncements();
      }
    }
  });
});

// ==============================
// Load Reports for Logged-in User
// ==============================
async function loadUserReports() {
  const container = document.getElementById("user-reports-container");
  if (!container) return;

  container.innerHTML = `<p>Loading your reports...</p>`;

  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      container.innerHTML = `<p>Please log in to see your reports.</p>`;
      return;
    }

    const { data, error } = await supabase
    .from("reports")
    .select(`
      *,
      barangays ( name )
    `)
    .eq('user_id', user.id)
    .order("created_at", { ascending: false });


    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-outlined">description</span>
          <p>No previous reports</p>
          <p class="empty-state-detail">Your outage reports will appear here</p>
        </div>`;
      return;
    }

    container.innerHTML = data
      .map(
        (report) => `
        <div class="report-card" data-id="${report.id}">
          <div class="report-header">
            <div class="feeder-info">${report.barangays?.name || "N/A"}</div>
            <div class="status status-${(report.status || "pending").toLowerCase()}">${formatStatus(report.status)}</div>
          </div>
          <div class="report-date">Reported: ${new Date(report.outage_time).toLocaleString()}</div>
          <div class="report-description">${report.description || ""}</div>
        </div>`
      )
      .join("");
      
  } catch (err) {
    console.error("Error loading user reports:", err);
    container.innerHTML = `<p>Failed to load reports.</p>`;
  }
}

// ==============================
// Listen for Realtime Report Updates
// ==============================
function subscribeToReportUpdates(userId) {
  if (reportSubscriptionChannel) return;
  
  if (!userId) {
    console.log("No user ID, skipping subscription.");
    return;
  }

  console.log("📡 Subscribing to report updates for user:", userId);

  reportSubscriptionChannel = supabase
    .channel('public:reports')
    .on(
      'postgres_changes',
      { 
        event: 'UPDATE',
        schema: 'public',
        table: 'reports',
        filter: `user_id=eq.${userId}` 
      },
      (payload) => {
        console.log('✅ Realtime update received!', payload);
        loadUserReports();
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ Successfully subscribed to report updates!');
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('Subscription error:', err);
        supabase.removeChannel(reportSubscriptionChannel);
        reportSubscriptionChannel = null;
      }
    });
}

// ==============================
// MODIFIED: Announcement Details Modal (Full Image Fix)
// ==============================
async function showAnnouncementDetails(announcementId) {
  const { data: announcement, error } = await supabase
    .from("announcements")
    .select("*, feeders ( name )")
    .eq("id", announcementId)
    .single();

  if (error) {
    console.error("Error loading details:", error);
    alert("❌ Failed to load details");
    return;
  }

  const { data: images } = await supabase
    .from("announcement_images")
    .select("*")
    .eq("announcement_id", announcementId);

  // Helpers
  const formatModalDate = (d) => d ? new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' }) : "N/A";
  const formatArray = (arr) => (!arr || arr.length === 0) ? "None listed" : arr.join(', ');
  const getStatusColor = (status) => {
      const s = (status || '').toLowerCase();
      if (s === 'reported') return '#ffebe6; color:#c0392b';
      if (s === 'ongoing') return '#e6f4ea; color:#1e8e3e';
      if (s === 'completed') return '#e6f4ea; color:#1e8e3e';
      if (s === 'scheduled') return '#e8f0fe; color:#1967d2';
      return '#f1f3f4; color:#5f6368';
  };

  const heroImage = (images && images.length > 0) ? images[0].image_url : null;
  const isMobile = window.innerWidth < 640;

  // === Map Eligibility Logic ===
  const statusLower = (announcement.status || '').toLowerCase();
  const isMapEligible = (statusLower === 'reported' || statusLower === 'ongoing');
  const hasCoords = (announcement.latitude && announcement.longitude);

  document.querySelectorAll(".report-modal").forEach(m => m.remove());

  const modal = document.createElement("div");
  modal.classList.add("report-modal");
  
  // Modern Overlay
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
    display: flex; justify-content: center; align-items: flex-end;
    z-index: 10000;
  `;

  // === FIX 1: MODAL IMAGE DISPLAY ===
  // Removed "background: url() cover" and replaced with an <img> tag logic
  modal.innerHTML = `
    <div class="modal-content" style="
        background: #fff; width: 100%; max-width: 600px;
        height: ${isMobile ? '85vh' : 'auto'}; max-height: 90vh;
        border-radius: ${isMobile ? '20px 20px 0 0' : '16px'};
        display: flex; flex-direction: column; overflow: hidden;
        box-shadow: 0 10px 40px rgba(0,0,0,0.4); margin: ${isMobile ? '0' : 'auto'};
        animation: slideUp 0.3s ease-out;
    ">
      
      <div style="position: relative; width: 100%; background: #f8f9fa; flex-shrink: 0; min-height: 60px; display: flex; justify-content: center; align-items: center; overflow: hidden;">
         ${heroImage 
            ? `<img src="${heroImage}" style="width: 100%; height: auto; max-height: 350px; object-fit: contain; display: block;" alt="Announcement Image">` 
            : ''
         }
         <button class="modal-close" style="
            position: absolute; top: 12px; right: 12px; 
            width: 32px; height: 32px; border-radius: 50%; 
            background: rgba(0,0,0,0.5); border: none; color: #fff; 
            display: flex; align-items: center; justify-content: center; 
            cursor: pointer; backdrop-filter: blur(4px); font-size: 18px; z-index: 2;
         ">✕</button>
      </div>

      <div style="flex: 1; overflow-y: auto; padding: 20px 24px;">
        <div style="margin-bottom: 20px;">
           <div style="display:flex; align-items:center; gap: 10px; margin-bottom: 8px;">
              <span style="background: ${getStatusColor(announcement.status)}; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${announcement.status || 'Unknown'}</span>
              <span style="font-size: 0.8rem; color: #777;">${formatModalDate(announcement.created_at)}</span>
           </div>
           <h2 style="margin: 0; font-size: 1.4rem; color: #202124; line-height: 1.3;">${announcement.cause || 'Outage'} at ${announcement.location || 'Unknown Location'}</h2>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; background: #f8f9fa; padding: 16px; border-radius: 12px; margin-bottom: 20px;">
            <div><div style="font-size: 0.7rem; text-transform: uppercase; color: #5f6368; font-weight: 600;">Feeder</div><div style="font-weight: 500; color: #202124;">${announcement.feeders?.name || "N/A"}</div></div>
            <div><div style="font-size: 0.7rem; text-transform: uppercase; color: #5f6368; font-weight: 600;">Est. Restore</div><div style="font-weight: 500; color: #202124;">${formatModalDate(announcement.estimated_restoration_at)}</div></div>
            <div style="grid-column: span 2;"><div style="font-size: 0.7rem; text-transform: uppercase; color: #5f6368; font-weight: 600;">Affected Areas</div><div style="font-weight: 500; color: #202124; line-height: 1.4;">${formatArray(announcement.areas_affected)}</div></div>
        </div>

        <div style="margin-bottom: 24px;">
            <h3 style="font-size: 1rem; margin: 0 0 8px 0; color: #202124;">Details</h3>
            <p style="margin: 0; color: #444; line-height: 1.6; white-space: pre-wrap;">${announcement.description || "No further details provided."}</p>
        </div>

        ${(hasCoords && isMapEligible) ? `
        <button onclick="showInAppMap(${announcement.id}, ${announcement.latitude}, ${announcement.longitude})" style="width: 100%; padding: 12px; background: #fff; border: 1px solid #dadce0; border-radius: 8px; color: #1a73e8; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;">
            <span class="material-symbols-outlined">map</span> View Location on Map
        </button>
        ` : ''}
      </div>
    </div>
    <style>@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }</style>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector(".modal-close");
  const close = () => {
      const content = modal.querySelector(".modal-content");
      if(content) { content.style.transform = "translateY(100%)"; content.style.transition = "transform 0.2s"; }
      setTimeout(() => modal.remove(), 200);
  };
  
  closeBtn.addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
}

// === NEW: Redirect Helper ===
function showInAppMap(id, lat, long) {
  window.location.href = `map.html?id=${id}&lat=${lat}&lng=${long}`;
}

// ==============================
// Close Buttons Setup
// ==============================
function setupCloseButtons() {
  const closeFormBtn = document.getElementById("close-report-form");
  if (closeFormBtn) {
    // Ensure only one listener
    closeFormBtn.replaceWith(closeFormBtn.cloneNode(true));
    document.getElementById("close-report-form").addEventListener("click", () => {
        showPage("report");
    });
  }
}

// ==============================
// Page Switcher Helper
// ==============================
function showPage(pageId) {
  // Unsubscribe from dashboard if we are LEAVING it
  if (pageId !== 'dashboard' && dashboardSubscriptionChannel) {
      console.log("Leaving dashboard, unsubscribing from updates.");
      supabase.removeChannel(dashboardSubscriptionChannel);
      dashboardSubscriptionChannel = null;
  }

  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  const newPage = document.getElementById(pageId);
  if (newPage) {
    newPage.classList.add("active");
  }
  
  if (pageId === "dashboard") {
    initializeDashboard();
  }
}

// ==============================
// Helper Functions
// ==============================
function formatStatus(status) {
    if (!status || typeof status !== 'string') return "N/A"; 
    return status.charAt(0).toUpperCase() + status.slice(1);
}

// ========================================================
// === DASHBOARD FUNCTIONS (SORTING & RENDERING) ===
// ========================================================

// Cache for dashboard announcements
let allAnnouncementsCache = [];
let userBarangayCache = null; 

// =================================
// Listen for Realtime Dashboard Updates
// =================================
function subscribeToDashboardUpdates() {
  if (dashboardSubscriptionChannel) return;
  
  console.log("📡 Subscribing to dashboard announcements...");

  dashboardSubscriptionChannel = supabase
    .channel('public:announcements')
    .on(
      'postgres_changes',
      { 
        event: '*', 
        schema: 'public',
        table: 'announcements'
      },
      (payload) => {
        console.log('✅ Realtime dashboard update received!', payload);
        // loadDashboardAnnouncements();
        handleRealtimeUpdate(payload);
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ Successfully subscribed to dashboard updates!');
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('Subscription error:', err);
        supabase.removeChannel(dashboardSubscriptionChannel);
        dashboardSubscriptionChannel = null;
      }
    });
}

async function handleRealtimeUpdate(payload) {
  const { eventType, new: newItem, old: oldItem } = payload;

  switch (eventType) { 
    case 'INSERT':
        const { data: fullItem } = await supabase
            .from("announcements")
            .select("*, feeders ( name ), announcement_images!announcement_images_announcement_id_fkey ( image_url )")
            .eq('id', newItem.id)
            .single();
        if (fullItem) allAnnouncementsCache.unshift(fullItem);
        break;
    case 'UPDATE':
        const index = allAnnouncementsCache.findIndex(item => item.id === newItem.id);
        if (index !== -1) {
            allAnnouncementsCache[index] = { ...allAnnouncementsCache[index], ...newItem };
        }

        const existingElement = document.getElementById(`announcement-${newItem.id}`);
        if (existingElement) {
            existingElement.innerHTML = generateAnnouncementCardHTML(allAnnouncementsCache[index], userBarangayCache);
            
            sortAnnouncements(userBarangayCache);
            renderDashboardAnnouncements(allAnnouncementsCache, userBarangayCache);
            return;
        }
        break;
    case 'DELETE':
        allAnnouncementsCache = allAnnouncementsCache.filter(item => item.id === oldItem.id);
        break;
  }

  sortAnnouncements(userBarangayCache);
  renderDashboardAnnouncements(allAnnouncementsCache, userBarangayCache);
};

function generateAnnouncementCardHTML(announcement, userBrgyName) {
    const userBrgy = (userBrgyName || '').toLowerCase();
    const imageUrl = (announcement.announcement_images && announcement.announcement_images.length > 0) 
                     ? announcement.announcement_images[0].image_url 
                     : null;

    const descriptionShort = (announcement.description || "No description.").substring(0, 150) + 
                           (announcement.description && announcement.description.length > 150 ? '...' : '');

    const safeDescription = (announcement.description || "View announcement")
                             .substring(0, 100)
                             .replace(/'/g, "\\'")
                             .replace(/"/g, '&quot;')
                             .replace(/\n/g, " ");

    // Badge Logic
    const mainMatch = (announcement.barangay || '').toLowerCase().includes(userBrgy);
    const areaMatch = Array.isArray(announcement.areas_affected) && 
                      announcement.areas_affected.some(area => area && area.toLowerCase().includes(userBrgy));
    const matchesUserArea = userBrgy && (mainMatch || areaMatch);

    // Status Logic
    let statusClass = 'status-unknown';
    const lowerStatus = (announcement.status || '').toLowerCase();
    if (lowerStatus === 'reported') statusClass = 'status-reported';
    else if (lowerStatus === 'ongoing') statusClass = 'status-ongoing';
    else if (lowerStatus === 'completed') statusClass = 'status-completed';
    else if (lowerStatus === 'scheduled') statusClass = 'status-scheduled';
    else if (lowerStatus === 'unscheduled') statusClass = 'status-unscheduled';

    return `
        <div class="card-header" style="padding: 16px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
            <div>
                <h3 style="margin: 0; font-size: 1.0rem; color: #333; line-height: 1.4;">
                    ${announcement.cause || 'Power Outage'} at ${announcement.location || 'Area'}
                </h3>
                <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: #777;">
                    Posted: ${new Date(announcement.created_at).toLocaleString()}
                </p>
            </div>
            ${matchesUserArea ? `
            <span style="background: #e6f7ff; border: 1px solid #91d5ff; color: #096dd9; font-size: 0.7rem; font-weight: 600; padding: 4px 8px; border-radius: 12px; flex-shrink: 0;">
                Your Area
            </span>
            ` : ''}
        </div>

        <div class="card-details-grid" style="padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
                <span style="font-size: 0.7rem; color: #888; display: block; text-transform: uppercase; margin-bottom: 2px;">Feeder</span>
                <span style="font-size: 0.85rem; color: #333; display: block; font-weight: 500;">${announcement.feeders?.name || "N/A"}</span>
            </div>
            <div>
                <span style="font-size: 0.7rem; color: #888; display: block; text-transform: uppercase; margin-bottom: 2px;">Type</span>
                <span style="font-size: 0.85rem; color: #333; display: block; font-weight: 500;">${formatStatus(announcement.type)}</span>
            </div>
            <div>
                <span style="font-size: 0.7rem; color: #888; display: block; text-transform: uppercase; margin-bottom: 2px;">Area</span>
                <span style="font-size: 0.85rem; color: #333; display: block; font-weight: 500;">${announcement.barangay || "N/A"}</span>
            </div>
            <div>
                <span style="font-size: 0.7rem; color: #888; display: block; text-transform: uppercase; margin-bottom: 2px;">Status</span>
                <span class="status-pill ${statusClass}" style="font-size: 0.75rem; font-weight: 600; padding: 3px 10px; border-radius: 12px; display: inline-block;">
                    ${formatStatus(announcement.status)}
                </span>
            </div>
        </div>

        ${imageUrl ? `
        <div class="card-image-container" style="width: 100%; max-height: 70vh; overflow: hidden; background: #f0f0f0;" onclick="showAnnouncementDetails(${announcement.id})">
            <img src="${imageUrl}" alt="Announcement Image" style="width: 100%; height: auto; display: block; cursor: pointer;" 
                 onerror="this.style.display='none'; this.parentElement.style.display='none';">
        </div>
        ` : ''}
        
        <div class="card-content" style="padding: 16px; border-top: 1px solid #f0f0f0;" onclick="showAnnouncementDetails(${announcement.id})">
            <p style="margin: 0; color: #555; font-size: 0.9rem; line-height: 1.5; word-break: break-word; white-space: pre-line; cursor: pointer;">
                ${descriptionShort}
            </p> 
        </div>
        
        <div class="card-footer" style="padding: 10px 16px; border-top: 1px solid #f0f0f0; background: #fafafa;">
            <button class="share-button" style="
                background: none; border: none; cursor: pointer; padding: 8px; 
                display: flex; align-items: center; justify-content: center;
                gap: 8px; font-size: 0.85rem; color: #555; font-weight: 600;
                border-radius: 6px; width: 100%;
            " onclick="handleShareClick(event, ${announcement.id}, '${safeDescription}')">
                <span class="material-symbols-outlined" style="font-size: 1.1rem;">share</span>
                Share
            </button>
        </div>
    `;
}

function sortAnnouncements(targetBarangay) {
  if (!targetBarangay) return;
  const target = targetBarangay.toLowerCase();

  allAnnouncementsCache.sort((a, b) => {
    const getScore = (item) => {
      const mainMatch = (item.barangay || '').toLowerCase() === target;
      const areaMatch = Array.isArray(item.areas_affected) && 
                        item.areas_affected.some(area => area && area.toLowerCase().includes(target));
      
      const isRelevant = mainMatch || areaMatch;
      if (!isRelevant) return 0;

      const s = (item.status || '').toLowerCase();
      if (s === 'reported' || s === 'ongoing') return 100;
      return 50;
    };

    const scoreA = getScore(a);
    const scoreB = getScore(b);

    if (scoreA !== scoreB) return scoreB - scoreA;
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

// ==============================
// Initialize Dashboard
// ==============================
function initializeDashboard() {
    loadDashboardAnnouncements(); 
    subscribeToDashboardUpdates(); 
    setupPullToRefresh(); 
    
    // Search functionality
    const searchInput = document.querySelector('#dashboard .search-input'); 
    if (searchInput) {
        searchInput.addEventListener('keyup', function(e) {
            filterAnnouncements(e.target.value);
        });
    }
    
    // Filter functionality
    const filterSelects = document.querySelectorAll('#dashboard .filter-select'); 
    filterSelects.forEach(select => {
        select.addEventListener('change', function() {
            filterAnnouncements(); 
        });
    });

    // === FIX 2: MOBILE DATE PLACEHOLDER FIX ===
    // This forces the date input to look like a Text input with a placeholder 
    // until the user taps it.
    const dateInput = document.querySelector('#dashboard input[type="date"].filter-select');
    if (dateInput) {
        // Set initial state
        if (!dateInput.value) {
            dateInput.setAttribute('type', 'text');
            dateInput.setAttribute('placeholder', 'Filter by Date');
        }

        dateInput.addEventListener('focus', function() {
            this.setAttribute('type', 'date');
            // Try to trigger picker immediately if supported
            if(this.showPicker) {
                try { this.showPicker(); } catch(e) {}
            }
        });

        dateInput.addEventListener('blur', function() {
            if (!this.value) {
                this.setAttribute('type', 'text');
            }
        });
    }
}

// ==============================
// Setup Pull-to-Refresh (PRESERVED)
// ==============================
let ptrIndicator; 
function setupPullToRefresh() {
    if (!ptrIndicator) {
        ptrIndicator = document.createElement('div');
        ptrIndicator.id = 'ptr-indicator';
        ptrIndicator.innerHTML = `<span class="material-symbols-outlined">refresh</span>`;
        ptrIndicator.style.cssText = `
            position: fixed;
            top: 60px; /* Below header */
            left: 50%;
            transform: translateX(-50%) scale(0.8);
            background: #fff;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            display: none; /* Hidden by default */
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 24px;
            color: #f1c40f;
            z-index: 999;
            transition: transform 0.2s, opacity 0.2s;
            opacity: 0;
        `;
        document.body.appendChild(ptrIndicator);

        // Add spin animation
        try {
            const styleSheet = document.styleSheets[0] || document.head.appendChild(document.createElement("style")).sheet;
            const ruleExists = Array.from(styleSheet.cssRules).some(rule => rule.name === 'spin');
            if (!ruleExists) {
                styleSheet.insertRule(`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `, styleSheet.cssRules.length);
            }
        } catch (e) { console.warn(e); }
    }

    let touchStartY = 0;
    let isRefreshing = false;
    const dashboardPage = document.getElementById('dashboard'); 

    dashboardPage.ontouchstart = null;
    dashboardPage.ontouchmove = null;
    dashboardPage.ontouchend = null;

    dashboardPage.addEventListener('touchstart', (e) => {
        if (isRefreshing || window.scrollY !== 0) return;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    dashboardPage.addEventListener('touchmove', (e) => {
        if (isRefreshing || window.scrollY !== 0) {
            touchStartY = e.touches[0].clientY; 
            return;
        }
        
        const touchY = e.touches[0].clientY;
        const diff = touchY - touchStartY;

        if (diff > 0) { 
            if (diff > 50) { 
                ptrIndicator.style.display = 'flex';
                ptrIndicator.style.opacity = '1';
                ptrIndicator.style.transform = `translateX(-50%) scale(${Math.min(1.2, 1 + (diff - 50) / 100)})`;
            }
        }
    }, { passive: true }); 

    dashboardPage.addEventListener('touchend', async (e) => {
        const touchY = e.changedTouches[0].clientY;
        const diff = touchY - touchStartY;

        if (isRefreshing) return;

        if (window.scrollY !== 0) {
             ptrIndicator.style.opacity = '0';
             ptrIndicator.style.transform = 'translateX(-50%) scale(0.8)';
            return;
        }

        if (diff > 80) { 
            isRefreshing = true;
            ptrIndicator.style.display = 'flex';
            ptrIndicator.style.opacity = '1';
            ptrIndicator.style.transform = 'translateX(-50%) scale(1.1)';
            ptrIndicator.querySelector('span').style.animation = 'spin 1s linear infinite';

            try {
                await loadDashboardAnnouncements(); 
            } catch (err) {
                console.error("Pull to refresh failed:", err);
            }
            
            // Hide and reset
            ptrIndicator.style.opacity = '0';
            ptrIndicator.style.transform = 'translateX(-50%) scale(0.8)';
            ptrIndicator.querySelector('span').style.animation = '';
            isRefreshing = false;
        } else if (diff > 0) {
            ptrIndicator.style.opacity = '0';
            ptrIndicator.style.transform = 'translateX(-50%) scale(0.8)';
        }
        touchStartY = 0;
    });
}


// ==============================
// Load & SORT Announcements (MODIFIED for VIP Sorting + URL Focus)
// ==============================
async function loadDashboardAnnouncements() {
    const container = document.getElementById('reports-container'); 
    if (!container) return;
    
    container.innerHTML = `<p>Loading announcements...</p>`;

    try {
        let userBrgyName = null;
        
        // 1. Get User's Barangay
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('barangay') 
                .eq('id', user.id)
                .single();
            
            if (profile && profile.barangay && profile.barangay !== 'Not set') {
                // Determine if ID or Name
                if (!isNaN(profile.barangay)) {
                    const { data: bData } = await supabase
                        .from('barangays')
                        .select('name')
                        .eq('id', profile.barangay)
                        .single();
                    if (bData) userBrgyName = bData.name;
                } else {
                    userBrgyName = profile.barangay;
                }
            }
        }
        
        userBarangayCache = userBrgyName;
        console.log("Logged in user barangay name:", userBrgyName);

        // 2. FETCH ALL ANNOUNCEMENTS (No database filtering)
        let query = supabase
            .from("announcements")
            .select("*, feeders ( name ), announcement_images!announcement_images_announcement_id_fkey ( image_url )")
            .order("created_at", { ascending: false });

        const { data, error } = await query;
        if (error) throw error;

        allAnnouncementsCache = data || []; 

        sortAnnouncements(userBarangayCache);

        if (allAnnouncementsCache.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-symbols-outlined">campaign</span>
                    <p>No announcements available</p>
                </div>
            `;
            return;
        }
        
        renderDashboardAnnouncements(allAnnouncementsCache, userBarangayCache); 
        handleUrlFocus();

    } catch (err) {
        console.error("Error loading dashboard announcements:", err);
        container.innerHTML = `<p>Failed to load announcements.</p>`;
    }
}

// ==============================
// Render Dashboard Announcements (MODIFIED for Card UI + IDs)
// ==============================
function renderDashboardAnnouncements(announcementsToRender, userBrgyName) { 
    const container = document.getElementById('reports-container');
    if (!container) return;

    // Inject styles for new cards
    let styleTag = document.getElementById('dynamic-container-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-container-style';
        document.head.appendChild(styleTag);
    }
    styleTag.innerHTML = `
        #reports-container {
            display: flex; flex-direction: column; padding: 16px; box-sizing: border-box;
        }
        .announcement-card {
            background: #fff; border-radius: 8px; border: 1px solid #ddd;
            box-shadow: 0 1px 3px rgba(0,0,0,0.12); overflow: hidden;
            max-width: 800px; width: 100%; margin: 0 auto 16px auto; 
        }
        .status-pill.status-reported { background-color: #ffebe6; color: #d93026; }
        .status-pill.status-ongoing { background-color: #e6f4ea; color: #1e8e3e; }
        .status-pill.status-completed { background-color: #e6f4ea; color: #1e8e3e; }
        .status-pill.status-unknown, .status-pill.status-scheduled, .status-pill.status-unscheduled { 
            background-color: #f1f3f4; color: #5f6368; 
        }
    `;

    if (announcementsToRender.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 20px;">
                <span class="material-symbols-outlined">search_off</span>
                <p>No matching announcements found</p>
            </div>
        `;
        return;
    }

    const userBrgy = (userBrgyName || '').toLowerCase();

    container.innerHTML = announcementsToRender.map(announcement => {
        const imageUrl = (announcement.announcement_images && announcement.announcement_images.length > 0) 
                         ? announcement.announcement_images[0].image_url 
                         : null;

        const descriptionShort = (announcement.description || "No description.").substring(0, 150) + 
                               (announcement.description && announcement.description.length > 150 ? '...' : '');

        const safeDescription = (announcement.description || "View announcement")
                                 .substring(0, 100)
                                 .replace(/'/g, "\\'")
                                 .replace(/"/g, '&quot;')
                                 .replace(/\n/g, " ");

        // Badge Logic
        const mainMatch = (announcement.barangay || '').toLowerCase().includes(userBrgy);
        const areaMatch = Array.isArray(announcement.areas_affected) && announcement.areas_affected.some(area => area && area.toLowerCase().includes(userBrgy));
        const matchesUserArea = userBrgy && (mainMatch || areaMatch);

        // Status Logic
        let statusClass = 'status-unknown';
        const lowerStatus = (announcement.status || '').toLowerCase();
        if (lowerStatus === 'reported') statusClass = 'status-reported';
        else if (lowerStatus === 'ongoing') statusClass = 'status-ongoing';
        else if (lowerStatus === 'completed') statusClass = 'status-completed';
        else if (lowerStatus === 'scheduled') statusClass = 'status-scheduled';
        else if (lowerStatus === 'unscheduled') statusClass = 'status-unscheduled';


        return `
        <div class="announcement-card" id="announcement-${announcement.id}">
            ${generateAnnouncementCardHTML(announcement, userBrgyName)}
        </div>
        `;
    }).join('');
}

// ==============================
// Handle Share Button Click (PRESERVED)
// ==============================
async function handleShareClick(event, announcementId, text) {
    event.stopPropagation(); 
    
    const shareData = {
        title: "Announcement",
        text: text,
        url: window.location.href 
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
            console.log('✅ Content shared successfully');
        } catch (err) {
            console.warn('Share was cancelled or failed:', err);
        }
    } else {
        console.log('Web Share API not supported.');
        alert('Share feature is not available on this device.'); 
    }
}


// ==============================
// Filter Dashboard Announcements (PRESERVED)
// ==============================
function filterAnnouncements(searchTerm = '') { 
    let filteredAnnouncements = [...allAnnouncementsCache];
    
    // Check search term
    const searchInput = document.querySelector('#dashboard .search-input');
    if (!searchTerm && searchInput) {
        searchTerm = searchInput.value.trim();
    }

    if (searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        filteredAnnouncements = filteredAnnouncements.filter(announcement => {
            const searchables = [
                announcement.feeders?.name,
                announcement.barangay,
                announcement.description,
                announcement.location, 
                announcement.type, 
                announcement.cause, 
                ...(announcement.areas_affected || []) 
            ];
            
            return searchables.some(text => 
                text && text.toLowerCase().includes(lowerSearchTerm)
            );
        });
    }

    // Check Date Filter
    const dateInput = document.querySelector('#dashboard input[type="date"].filter-select');
    if (dateInput && dateInput.value) {
        const selectedDate = new Date(dateInput.value);
        selectedDate.setHours(0,0,0,0);
        const selectedTime = selectedDate.getTime();

        filteredAnnouncements = filteredAnnouncements.filter(announcement => {
            const rDate = new Date(announcement.created_at);
            rDate.setHours(0,0,0,0);
            return rDate.getTime() === selectedTime;
        });
    }

    // Check Status Filter
    const statusFilter = document.querySelector('#dashboard select.filter-select');
    if (statusFilter && statusFilter.value && statusFilter.value !== 'All Status' && statusFilter.value !== 'Select Status') {
        const lowerStatus = statusFilter.value.toLowerCase();
        filteredAnnouncements = filteredAnnouncements.filter(announcement => 
            (announcement.status || '').toLowerCase() === lowerStatus
        );
    }
    
    renderDashboardAnnouncements(filteredAnnouncements, userBarangayCache); 
}

// ==============================
// Handle Deep Link Focus
// ==============================
function handleUrlFocus() {
    const params = new URLSearchParams(window.location.search);
    const focusId = params.get('focus_announcement');

    if (focusId) {
        // Wait a tiny bit for the DOM to be ready
        setTimeout(() => {
            const element = document.getElementById(`announcement-${focusId}`);
            if (element) {
                // Scroll the card into the center of the screen
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // Add a visual "flash" so the user knows which one it is
                element.style.transition = 'box-shadow 0.5s ease, border-color 0.5s ease';
                element.style.boxShadow = '0 0 0 4px rgba(241, 196, 15, 0.5)'; // Gold glow
                element.style.borderColor = '#f1c40f';

                // Remove the glow after 2 seconds
                setTimeout(() => {
                    element.style.boxShadow = '';
                    element.style.borderColor = '';
                }, 2000);
            }
        }, 300); // 300ms delay to ensure HTML is painted
    }
}

document.addEventListener('alpine:init', () => {
  Alpine.data('beaconApp', () => ({
    currentPage: 'dashboard',
    announcements: [],
    userReports: [],
    searchTerm: '',
    dateFilter: '',
    statusFilter: '',
    userBrgy: null,
    selectedItem: null,
    userName: 'John Smith',
    userInitials: 'JS',
    userRole: 'User',
    navItems: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
      { id: 'report', label: 'Report', icon: 'report' },
      { id: 'map', label: 'Map', icon: 'map' }
    ],

    async init() {
      await waitForSupabase();
      this.setupAuth();
      this.subscribeToRealtime();
    },

    async setupAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Fetch profile/barangay
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        this.userBrgy = profile?.barangay;
        this.loadUserReports(user.id);
      }
      this.loadDashboard();
    },

    async loadDashboard() {
      const { data } = await supabase
        .from("announcements")
        .select("*, feeders(name), announcement_images(image_url)")
        .order("created_at", { ascending: false });
      this.announcements = data || [];
    },

    // REAL-TIME Logic: Seamless and non-flickering
    subscribeToRealtime() {
      supabase.channel('db-changes')
        .on('postgres_changes', { event: '*', table: 'announcements' }, async (payload) => {
          if (payload.eventType === 'INSERT') {
            // Fetch relations for new item
            const { data } = await supabase.from("announcements").select("*, feeders(name), announcement_images(image_url)").eq('id', payload.new.id).single();
            this.announcements.unshift(data);
          } else if (payload.eventType === 'UPDATE') {
            const idx = this.announcements.findIndex(a => a.id === payload.new.id);
            if (idx !== -1) Object.assign(this.announcements[idx], payload.new);
          } else if (payload.eventType === 'DELETE') {
            this.announcements = this.announcements.filter(a => a.id !== payload.old.id);
          }
        }).subscribe();
    },

    // COMPUTED PROPERTY: Automatically sorts and filters
    get processedAnnouncements() {
      let list = this.announcements.filter(item => {
        const matchesSearch = !this.searchTerm || JSON.stringify(item).toLowerCase().includes(this.searchTerm.toLowerCase());
        const matchesStatus = !this.statusFilter || item.status === this.statusFilter;
        // Add date filter logic here
        return matchesSearch && matchesStatus;
      });

      // VIP Scoring/Sorting
      return list.sort((a, b) => {
        const getScore = (item) => {
          const isRelevant = item.barangay === this.userBrgy;
          if (!isRelevant) return 0;
          return (item.status === 'Reported' || item.status === 'Ongoing') ? 100 : 50;
        };
        return getScore(b) - getScore(a) || new Date(b.created_at) - new Date(a.created_at);
      });
    },

    showPage(page) { this.currentPage = page; },
    openDetails(item) { this.selectedItem = item; },
    isUserArea(item) { return item.barangay === this.userBrgy; },
    formatDate(d) { return new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); },
    goToMap(item) { window.location.href = `map.html?id=${item.id}&lat=${item.latitude}&lng=${item.longitude}`; }
  }));
});