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
      option.value = barangay.id; // Store the ID as the value
      option.textContent = barangay.name; // Display the name
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
let reportSubscriptionChannel = null; // Store subscription channel
let dashboardSubscriptionChannel = null; // NEW: Store dashboard subscription

document.addEventListener("DOMContentLoaded", async () => {
  await waitForSupabase();
  await loadBarangays();
  
  setupCloseButtons();
  
  showPage('dashboard'); // NEW: Set the dashboard as the default page on load
  
  // Listen for authentication changes
  supabase.auth.onAuthStateChange((event, session) => {
    console.log("Auth event:", event);
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      // User is logged in, load their reports and subscribe to updates
      loadUserReports(); // Load user-specific reports in the background
      if(session?.user?.id) {
        subscribeToReportUpdates(session.user.id);
      }
      // NEW: Reload dashboard to check for user's barangay
      if (document.getElementById('dashboard').classList.contains('active')) {
        loadDashboardAnnouncements();
      }
    } else if (event === 'SIGNED_OUT') {
      // User signed out, clear reports and unsubscribe
      const container = document.getElementById("user-reports-container");
      if (container) {
          container.innerHTML = `<p>Please log in to see your reports.</p>`;
      }
      if (reportSubscriptionChannel) {
        supabase.removeChannel(reportSubscriptionChannel);
        reportSubscriptionChannel = null;
        console.log("📡 Unsubscribed from report updates.");
      }
      // NEW: Cleanup dashboard subscription on sign out
      if (dashboardSubscriptionChannel) {
        supabase.removeChannel(dashboardSubscriptionChannel);
        dashboardSubscriptionChannel = null;
        console.log("📡 Unsubscribed from dashboard updates.");
      }
      // NEW: Reload dashboard as a logged-out user
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

    // UPDATED QUERY:
    // We now select from 'barangays' table to get the 'name'
    const { data, error } = await supabase
    .from("announcements")
    .select(`
      *,
      announcement_images!announcement_images_announcement_id_fkey (
        image_url
      )
    `)
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
            <!-- UPDATED DISPLAY: Use the fetched name -->
            <div class="feeder-info">${report.barangays?.name || "N/A"}</div>
            <div class="status status-${report.status || "pending"}">${formatStatus(report.status)}</div>
          </div>
          <div class="report-date">Reported: ${new Date(report.outage_time).toLocaleString()}</div>
          <div class="report-description">${report.description || ""}</div>
        </div>`
      )
      .join("");

    document.querySelectorAll(".report-card").forEach((card) => {
      card.addEventListener("click", () => showReportDetails(card.dataset.id));
    });
  } catch (err) {
    console.error("Error loading user reports:", err);
    container.innerHTML = `<p>Failed to load reports.</p>`;
  }
}

// ==============================
// Listen for Realtime Report Updates (NEW FUNCTION)
// ==============================
function subscribeToReportUpdates(userId) {
  // If already subscribed, don't create a new channel
  if (reportSubscriptionChannel) {
    return;
  }
  
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
        event: 'UPDATE', // Listen only for UPDATEs
        schema: 'public',
        table: 'reports',
        filter: `user_id=eq.${userId}` // Only get updates for this user's reports
      },
      (payload) => {
        console.log('✅ Realtime update received!', payload);
        // When an update comes in, just reload the whole list
        loadUserReports();
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ Successfully subscribed to report updates!');
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('Subscription error:', err);
        // If subscription fails, remove the channel so we can try again
        supabase.removeChannel(reportSubscriptionChannel);
        reportSubscriptionChannel = null;
      }
    });
}

// ==============================
// NEW: Announcement Details Modal (UPDATED)
// ==============================
async function showAnnouncementDetails(announcementId) {
  // Query for the specific announcement and its related feeder
  const { data: announcement, error } = await supabase
    .from("announcements")
    .select("*, feeders ( name )") // Get feeder name
    .eq("id", announcementId)
    .single();
    
  if (error) {
    console.error("Error loading announcement details:", error);
    // Assuming showConfirmationPopup exists elsewhere in your code
    // showConfirmationPopup("❌ Failed to load announcement details", true);
    alert("❌ Failed to load announcement details"); // Fallback
    return;
  }

  // Query for any images related to this announcement
  const { data: images } = await supabase
    .from("announcement_images")
    .select("*")
    .eq("announcement_id", announcementId);

  // Remove existing modals
  document.querySelectorAll(".report-modal").forEach(m => m.remove());

  const modal = document.createElement("div");
  modal.classList.add("report-modal"); // Can reuse the same class
  modal.style.cssText = `
    position:fixed;
    top:0;
    left:0;
    width:100%;
    height:100%;
    background:rgba(0,0,0,0.5);
    display:flex;
    justify-content:center;
    align-items:center;
    z-index:9999;
    overflow:auto;
    padding:20px;
    box-sizing:border-box;
  `;

  // === NEW: Helper functions for modal formatting ===
  const formatModalDate = (dateStr) => {
    return dateStr ? new Date(dateStr).toLocaleString() : "N/A";
  };
  
  const formatArray = (arr) => {
    if (!arr || arr.length === 0) return "N/A";
    return arr.join(', ');
  };
  
  const formatCoords = (lat, long) => {
    if (lat && long) {
      // CHANGED: This now calls a Javascript function instead of a direct link
      return `${lat}, ${long} (<a onclick="showInAppMap(${lat}, ${long})" style="color:#f1c40f; cursor:pointer; text-decoration:underline;">View In-App Map</a>)`;
    }
    return "N/A";
  };
  // === End of new helpers ===


  modal.innerHTML = `
    <!-- NEW: Style block to control modal width AND height -->
    <style>
      .report-modal .modal-content {
        max-width: 400px; /* Default for mobile */
        margin: auto; /* Center it */
        max-height: 90vh; /* Set max height to 90% of screen */
        overflow-y: auto; /* Make the whole modal scrollable */
      }
      @media (min-width: 640px) {
        .report-modal .modal-content {
          max-width: 800px; /* Wider for web view */
        }
      }
    </style>
    <div class="modal-content" style="
      position:relative;
      background:#fff;
      border:2px solid #f1c40f;
      border-radius:14px;
      width:100%;
      /* max-width is now controlled by the <style> tag above */
      padding:12px;
      box-sizing:border-box;
    ">
      <!-- X Button -->
      <button class="modal-close" style="
        position:absolute;
        top:8px;
        right:8px;
        width:28px;
        height:28px;
        font-size:18px;
        font-weight:bold;
        color:#fff;
        background:#f1c40f;
        border:none;
        border-radius:50%;
        cursor:pointer;
        box-shadow:0 2px 4px rgba(0,0,0,0.3);
        z-index:10;
        display:flex;
        align-items:center;
        justify-content:center;
        line-height:1;
      ">×</button>

      <!-- Images -->
      ${images && images.length
        ? `<div class="report-images-container" style="
            display:flex;
            flex-direction:column;
            gap:6px;
            margin-top:12px;
            /* REMOVED max-height and overflow-y */
          ">
            ${images.map(img => `<img src="${img.image_url}" style="width:100%;border-radius:8px;border:2px solid #f1c40f;">`).join("")}
          </div>`
        : `<p style='margin-top:12px;color:#888;'>No images for this announcement.</p>`
      }

      <!-- 
          === REDESIGNED DETAILS SECTION ===
          This now includes all fields from the 'announcements' table.
      -->
      <div class="report-details" style="padding-top:12px; font-size: 0.9em; /* REMOVED max-height and overflow-y */">
      
        <p style="margin: 4px 0;"><strong>Status:</strong> <span class="status status-${(announcement.status || 'pending').toLowerCase()}">${formatStatus(announcement.status)}</span></p>
        <p style="margin: 4px 0;"><strong>Type:</strong> ${formatStatus(announcement.type)}</p>
        <p style="margin: 4px 0;"><strong>Cause:</strong> ${announcement.cause || "N/A"}</p>
        
        <hr style="border:none; border-top: 1px solid #eee; margin: 10px 0;">

        <!-- Location Group -->
        <p style="margin: 4px 0;"><strong>Feeder:</strong> ${announcement.feeders?.name || "N/A"}</p>
        <p style="margin: 4px 0;"><strong>Primary Barangay:</strong> ${announcement.barangay || "N/A"}</p>
        <p style="margin: 4px 0;"><strong>Specific Location:</strong> ${announcement.location || "N/A"}</p>
        <p style="margin: 4px 0;"><strong>Areas Affected:</strong> ${formatArray(announcement.areas_affected)}</p>
        <p style="margin: 4px 0;"><strong>Coordinates:</strong> ${formatCoords(announcement.latitude, announcement.longitude)}</p>

        <hr style="border:none; border-top: 1px solid #eee; margin: 10px 0;">

        <!-- Description -->
        <p style="margin: 4px 0;"><strong>Description:</strong></p>
        <p style="margin: 4px 0; white-space: pre-wrap; word-break: break-word; background: #f9f9f9; padding: 8px; border-radius: 6px;">${announcement.description || "N/A"}</p>

        <hr style="border:none; border-top: 1px solid #eee; margin: 10px 0;">

        <!-- Time Group -->
        <p style="margin: 4px 0;"><strong>Posted On:</strong> ${formatModalDate(announcement.created_at)}</p>
        <p style="margin: 4px 0;"><strong>Last Updated:</strong> ${formatModalDate(announcement.updated_at)}</p>
        <p style="margin: 4px 0;"><strong>Est. Restoration:</strong> ${formatModalDate(announcement.estimated_restoration_at)}</p>
        <p style="margin: 4px 0;"><strong>Restored On:</strong> ${formatModalDate(announcement.restored_at)}</p>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close modal
  modal.querySelector(".modal-close").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}

// NEW: Add this function to handle the in-app map link
function showInAppMap(lat, long) {
  console.log(`Request to show map for: ${lat}, ${long}`);
  
  // HIDE THE MODAL FIRST
  const modal = document.querySelector(".report-modal");
  if (modal) {
    modal.remove();
  }

  // --- !! ACTION REQUIRED !! ---
  // 1. Set a global variable or session storage for your map page to read
  // Example:
  // window.mapCoordinates = { latitude: lat, longitude: long };

  // 2. Call your in-app page switcher to show your map page
  // Example:
  // showPage('YOUR-MAP-PAGE-ID'); 
  
  // For now, I will just alert. You MUST replace this with your code.
  alert(`Please wire this 'showInAppMap' function to 'showPage('your-map-page-id')'`);
}


// ==============================
// Close Buttons Setup (Form, etc.)
// ==============================
function setupCloseButtons() {
  const closeFormBtn = document.getElementById("close-report-form");
  if (closeFormBtn) {
    // Ensure only one listener
    closeFormBtn.replaceWith(closeFormBtn.cloneNode(true));
    document.getElementById("close-report-form").addEventListener("click", () => {
        // resetReportForm(); // Also reset form on close (assuming this function exists)
        showPage("report");
    });
  }
}

// ==============================
// Page Switcher Helper (UPDATED)
// ==============================
function showPage(pageId) {
  // NEW: Unsubscribe from dashboard if we are LEAVING it
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
  
  // Call initializer for the specific page being shown
  if (pageId === "report-form") {
    // initializeReportForm(); // (assuming this function exists)
  } else if (pageId === "dashboard") { // NEW: Initialize dashboard when shown
    initializeDashboard();
  }
}

// ==============================
// Helper Functions (UPDATED)
// ==============================
function formatStatus(status) {
    // Use "N/A" as a safer default instead of "Pending"
    if (!status || typeof status !== 'string') return "N/A"; 
    return status.charAt(0).toUpperCase() + status.slice(1);
}

// ========================================================
// === MODIFIED DASHBOARD FUNCTIONS (FOR ANNOUNCEMENTS) ===
// ========================================================

// Cache for dashboard announcements
let allAnnouncementsCache = [];
let userBarangayCache = null; // NEW: Cache for user's barangay name

// =================================
// NEW: Listen for Realtime Dashboard Updates
// =================================
function subscribeToDashboardUpdates() {
  // If already subscribed, don't create a new channel
  if (dashboardSubscriptionChannel) {
    return;
  }
  
  console.log("📡 Subscribing to dashboard announcements...");

  dashboardSubscriptionChannel = supabase
    .channel('public:announcements') // Watch the announcements table
    .on(
      'postgres_changes',
      { 
        event: '*', // Listen for INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'announcements'
        // No user filter needed, it's a public dashboard
      },
      (payload) => {
        console.log('✅ Realtime dashboard update received!', payload);
        // When an update comes in, just reload the whole list
        loadDashboardAnnouncements();
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ Successfully subscribed to dashboard updates!');
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('Subscription error:', err);
        // If subscription fails, remove the channel so we can try again
        supabase.removeChannel(dashboardSubscriptionChannel);
        dashboardSubscriptionChannel = null;
      }
    });
}

// ==============================
// Initialize Dashboard (UPDATED)
// ==============================
function initializeDashboard() {
    loadDashboardAnnouncements(); // Renamed function
    subscribeToDashboardUpdates(); // NEW: Start listening for updates
    setupPullToRefresh(); // NEW: Add pull-to-refresh
    
    // Search functionality
    const searchInput = document.querySelector('#dashboard .search-input'); // Scope search to dashboard
    if (searchInput) {
        // Use keyup for more responsive search
        searchInput.addEventListener('keyup', function(e) {
            filterAnnouncements(e.target.value); // Renamed function
        });
    }
    
    // Filter functionality
    const filterSelects = document.querySelectorAll('#dashboard .filter-select'); // Scope filters to dashboard
    filterSelects.forEach(select => {
        select.addEventListener('change', function() {
            filterAnnouncements(); // Renamed function
        });
    });
}

// ==============================
// NEW: Setup Pull-to-Refresh
// ==============================
let ptrIndicator; // Keep a reference to the indicator
function setupPullToRefresh() {
    // Only create indicator once
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

        // Add spin animation to stylesheet once
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
        } catch (e) {
            console.warn("Could not add CSS animation rule:", e);
        }
    }

    let touchStartY = 0;
    let isRefreshing = false;
    const dashboardPage = document.getElementById('dashboard'); // Listen on dashboard page

    // Remove old listeners if any
    dashboardPage.ontouchstart = null;
    dashboardPage.ontouchmove = null;
    dashboardPage.ontouchend = null;

    dashboardPage.addEventListener('touchstart', (e) => {
        if (isRefreshing || window.scrollY !== 0) return;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    dashboardPage.addEventListener('touchmove', (e) => {
        if (isRefreshing || window.scrollY !== 0) {
            touchStartY = e.touches[0].clientY; // Reset startY if scrolling
            return;
        }
        
        const touchY = e.touches[0].clientY;
        const diff = touchY - touchStartY;

        if (diff > 0) { // Only if pulling down
            if (diff > 50) { // Show indicator
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

        // Check scrollY again on touchend
        if (window.scrollY !== 0) {
             ptrIndicator.style.opacity = '0';
             ptrIndicator.style.transform = 'translateX(-50%) scale(0.8)';
            return;
        }

        if (diff > 80) { // Threshold to refresh
            isRefreshing = true;
            ptrIndicator.style.display = 'flex';
            ptrIndicator.style.opacity = '1';
            ptrIndicator.style.transform = 'translateX(-50%) scale(1.1)';
            ptrIndicator.querySelector('span').style.animation = 'spin 1s linear infinite';

            try {
                await loadDashboardAnnouncements(); // Wait for it to finish
            } catch (err) {
                console.error("Pull to refresh failed:", err);
            }
            
            // Hide and reset
            ptrIndicator.style.opacity = '0';
            ptrIndicator.style.transform = 'translateX(-50%) scale(0.8)';
            ptrIndicator.querySelector('span').style.animation = '';
            isRefreshing = false;
        } else if (diff > 0) {
            // Not enough pull, just hide
            ptrIndicator.style.opacity = '0';
            ptrIndicator.style.transform = 'translateX(-50%) scale(0.8)';
        }
        
        touchStartY = 0;
    });
}


// ==============================
// Load All Announcements for Dashboard (HEAVILY UPDATED)
// ==============================
async function loadDashboardAnnouncements() { // Renamed function
    const container = document.getElementById('reports-container'); // This ID is from your HTML
    if (!container) return;
    
    container.innerHTML = `<p>Loading announcements...</p>`;

    try {
        let userBarangayName = null;
        
        // NEW: Check for user and their profile's barangay
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            // Assuming 'profiles' table and 'barangay' column stores the ID
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('barangay') // Assuming this is the foreign key ID
                .eq('id', user.id)
                .single();
                
            if (profileError) {
                console.warn("Error fetching profile:", profileError.message);
            }
            
            if (profile && profile.barangay) {
                // Now get the name of that barangay
                const { data: barangayData, error: bError } = await supabase
                    .from('barangays')
                    .select('name')
                    .eq('id', profile.barangay)
                    .single();
                    
                if (barangayData) {
                    userBarangayName = barangayData.name;
                    userBarangayCache = userBarangayName; // NEW: Store in cache
                    console.log(`User's preferred barangay: ${userBarangayName}`);
                }
            } // <-- This brace was missing
        } else {
            userBarangayCache = null; // NEW: Clear cache if user logs out
        }

        // MODIFIED: Build query
        let query = supabase
            .from("announcements")
            // NEW: Select related images!
            .select("*, feeders ( name ), announcement_images!announcement_images_announcement_id_fkey ( image_url )");

        // NEW: Apply barangay filter if we found one
        if (userBarangayName) {
            // Filter for announcements where 'barangay' matches OR 'areas_affected' contains the user's barangay name
            query = query.or(`barangay.eq.${userBarangayName},areas_affected.cs.{${userBarangayName}}`);
        }
            
        // Add sorting
        query = query.order("created_at", { ascending: false });
        
        // Execute query
        const { data, error } = await query;
        
        if (error) throw error;
        
        allAnnouncementsCache = data || []; // Store in cache for filtering

        if (allAnnouncementsCache.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-symbols-outlined">campaign</span>
                    <p>No announcements available</p>
                    <p class="empty-state-detail">Official announcements will appear here.</p>
                </div>
            `;
            return;
        }
        
        // Initial render
        renderDashboardAnnouncements(allAnnouncementsCache, userBarangayName); // Renamed function

    } catch (err) {
        console.error("Error loading dashboard announcements:", err);
        container.innerHTML = `<p>Failed to load announcements.</p>`;
    }
}

// ==============================
// Render Dashboard Announcements (HEAVILY UPDATED for new style)
// ==============================
function renderDashboardAnnouncements(announcementsToRender, userBarangayName) { // Renamed function
    const container = document.getElementById('reports-container');
    if (!container) return;

    // NEW: Inject a style tag for gaps and pill colors
    let styleTag = document.getElementById('dynamic-container-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-container-style';
        document.head.appendChild(styleTag);
    }
    // This CSS adds gaps and defines the status pill colors you requested.
    // SIMPLIFIED: Removed mobile media query for simplicity and to force gaps.
    styleTag.innerHTML = `
        #reports-container {
            display: flex;
            flex-direction: column;
            padding: 16px; /* Simple 16px padding all around */
            box-sizing: border-box; /* Ensure padding is included */
        }
        .announcement-card {
            background: #fff;
            border-radius: 8px;
            border: 1px solid #ddd;
            box-shadow: 0 1px 3px rgba(0,0,0,0.12);
            overflow: hidden; /* Ensures rounded corners */
            max-width: 800px; /* Max width for cards */
            width: 100%;
            /* THE FIX: Combine auto-centering with 16px bottom margin */
            margin: 0 auto 16px auto; 
        }
        /* Pill Colors */
        .status-pill.status-reported { background-color: #ffebe6; color: #d93026; }
        .status-pill.status-ongoing { background-color: #e6f4ea; color: #1e8e3e; }
        .status-pill.status-completed { background-color: #e6f4ea; color: #1e8e3e; }
        .status-pill.status-unknown,
        .status-pill.status-scheduled, /* Added scheduled as neutral */
        .status-pill.status-unscheduled { 
            background-color: #f1f3f4; color: #5f6368; 
        }

        /* * REMOVED the @media (max-width: 640px) query.
         * The rules above will now apply to all screen sizes,
         * ensuring the 16px padding and 16px gap are 
         * always present, even on mobile.
         */
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

    // NEW: Get user barangay from argument for initial load or cache for filtering
    const userBrgy = (userBarangayName || userBarangayCache || '').toLowerCase();

    container.innerHTML = announcementsToRender.map(announcement => {
        // NEW: Get the first image, if it exists
        const imageUrl = (announcement.announcement_images && announcement.announcement_images.length > 0) 
                         ? announcement.announcement_images[0].image_url 
                         : null;

        const descriptionShort = (announcement.description || "No description.").substring(0, 150) + 
                               (announcement.description && announcement.description.length > 150 ? '...' : '');

        // NEW: Escape quotes in description for the share function
        const safeDescription = (announcement.description || "View announcement")
                                 .substring(0, 100)
                                 .replace(/'/g, "\\'")
                                 .replace(/"/g, '&quot;')
                                 .replace(/\n/g, " ");

        // === "YOUR AREA" BADGE LOGIC ===
        const mainBarangayMatch = announcement.barangay && userBrgy && announcement.barangay.toLowerCase().includes(userBrgy);
        const affectedAreasMatch = announcement.areas_affected && userBrgy && Array.isArray(announcement.areas_affected) && announcement.areas_affected.some(area => area && area.toLowerCase().includes(userBrgy));
        const matchesUserArea = mainBarangayMatch || affectedAreasMatch;

        // === PILL COLOR LOGIC ===
        let statusClass = 'status-unknown';
        const lowerStatus = (announcement.status || '').toLowerCase();
        if (lowerStatus === 'reported') statusClass = 'status-reported';
        else if (lowerStatus === 'ongoing') statusClass = 'status-ongoing';
        else if (lowerStatus === 'completed') statusClass = 'status-completed';
        else if (lowerStatus === 'scheduled') statusClass = 'status-scheduled';
        else if (lowerStatus === 'unscheduled') statusClass = 'status-unscheduled';


        return `
        <!-- NEW CARD DESIGN - Per your request -->
        <div class="announcement-card">
            
            <!-- Header: Title, Date, Badge -->
            <div class="card-header" style="padding: 16px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                <div>
                    <!-- Title: Cause at Location -->
                    <h3 style="margin: 0; font-size: 1.0rem; color: #333; line-height: 1.4;">
                        ${announcement.cause || 'Power Outage'} at ${announcement.location || 'Area'}
                    </h3>
                    <!-- Date/Time -->
                    <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: #777;">
                        Posted: ${new Date(announcement.created_at).toLocaleString()}
                    </p>
                </div>
                <!-- 'Your Area' Badge -->
                ${matchesUserArea ? `
                <span style="background: #e6f7ff; border: 1px solid #91d5ff; color: #096dd9; font-size: 0.7rem; font-weight: 600; padding: 4px 8px; border-radius: 12px; flex-shrink: 0;">
                    Your Area
                </span>
                ` : ''}
            </div>

            <!-- Body: Details Grid -->
            <div class="card-details-grid" style="padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <!-- Column 1 -->
                <div>
                    <span style="font-size: 0.7rem; color: #888; display: block; text-transform: uppercase; margin-bottom: 2px;">Feeder Number</span>
                    <span style="font-size: 0.85rem; color: #333; display: block; font-weight: 500;">${announcement.feeders?.name || "N/A"}</span>
                </div>
                <!-- Column 2 -->
                <div>
                    <span style="font-size: 0.7rem; color: #888; display: block; text-transform: uppercase; margin-bottom: 2px;">Type</span>
                    <span style="font-size: 0.85rem; color: #333; display: block; font-weight: 500;">${formatStatus(announcement.type)}</span>
                </div>
                <!-- Column 1 -->
                <div>
                    <span style="font-size: 0.7rem; color: #888; display: block; text-transform: uppercase; margin-bottom: 2px;">Area</span>
                    <span style="font-size: 0.85rem; color: #333; display: block; font-weight: 500;">${announcement.barangay || "N/A"}</span>
                </div>
                <!-- Column 2 -->
                <div>
                    <span style="font-size: 0.7rem; color: #888; display: block; text-transform: uppercase; margin-bottom: 2px;">Status</span>
                    <span class="status-pill ${statusClass}" style="font-size: 0.75rem; font-weight: 600; padding: 3px 10px; border-radius: 12px; display: inline-block;">
                        ${formatStatus(announcement.status)}
                    </span>
                </div>
            </div>

            <!-- Image: Dynamically added -->
            ${imageUrl ? `
            <div classD="card-image-container" style="width: 100%; max-height: 70vh; overflow: hidden; background: #f0f0f0;" onclick="showAnnouncementDetails(${announcement.id})">
                <img src="${imageUrl}" alt="Announcement Image" style="width: 100%; height: auto; display: block; cursor: pointer;" 
                     onerror="this.style.display='none'; this.parentElement.style.display='none';">
            </div>
            ` : ''}
            
            <!-- Description -->
            <div class.="card-content" style="padding: 16px; border-top: 1px solid #f0f0f0;" onclick="showAnnouncementDetails(${announcement.id})">
                <p style="margin: 0; color: #555; font-size: 0.9rem; line-height: 1.5; word-break: break-word; white-space: pre-line; cursor: pointer;">
                    ${descriptionShort}
                </I> 
            </div>
            
            <!-- Footer: Share Button -->
            <div class="card-footer" style="padding: 10px 16px; border-top: 1px solid #f0f0f0; background: #fafafa;">
                <button class="share-button" style="
                    background: none; 
                    border: none; 
                    cursor: pointer; 
                    padding: 8px; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; /* Center content */
                    gap: 8px; 
                    font-size: 0.85rem;
                    color: #555;
                    font-weight: 600;
                    border-radius: 6px;
                    width: 100%; /* Make div take full width */
                " onclick="handleShareClick(event, ${announcement.id}, '${safeDescription}')">
                    <span class="material-symbols-outlined" style="font-size: 1.1rem;">share</span>
                    Share
                </button>
            </div>
        </div>
        <!-- Card End -->
        `;
    }).join('');
}

// ==============================
// NEW: Handle Share Button Click
// ==============================
async function handleShareClick(event, announcementId, text) {
    event.stopPropagation(); // VERY IMPORTANT: Prevents the modal from opening
    
    const shareData = {
        title: "Announcement",
        text: text,
        url: window.location.href // We can't deep-link to a modal easily, so just share the page
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
            console.log('✅ Content shared successfully');
        } catch (err) {
            console.warn('Share was cancelled or failed:', err);
        }
    } else {
        // Fallback for desktop or unsupported browsers
        console.log('Web Share API not supported.');
        // Assuming showConfirmationPopup exists
        // showConfirmationPopup('Share feature is not available on this device.', true);
        alert('Share feature is not available on this device.'); // Fallback
    }
}


// ==============================
// Filter Dashboard Announcements (UPDATED)
// ==============================
function filterAnnouncements(searchTerm = '') { // Renamed function
    let filteredAnnouncements = [...allAnnouncementsCache];
    
    // If searchTerm not provided, read current search input value
    const searchInput = document.querySelector('#dashboard .search-input');
    if (!searchTerm && searchInput) {
        searchTerm = searchInput.value.trim();
    }

    // MODIFIED: Filter by search term (now includes location, type, cause, and areas_affected)
    if (searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        filteredAnnouncements = filteredAnnouncements.filter(announcement => {
            const searchables = [
                announcement.feeders?.name,
                announcement.barangay,
                announcement.description,
                announcement.location, // NEW
                announcement.type, // NEW
                announcement.cause, // NEW
                ...(announcement.areas_affected || []) // NEW (spread array)
            ];
            
            // Check if any searchable string includes the term
            return searchables.some(text => 
                text && text.toLowerCase().includes(lowerSearchTerm)
            );
        });
    }

    // Filter by date input (if selected)
    const dateInput = document.querySelector('#dashboard input[type="date"].filter-select');
    if (dateInput && dateInput.value) {
        // Normalize to midnight for comparison
        const selectedDate = new Date(dateInput.value);
        selectedDate.setHours(0,0,0,0);
        const selectedTime = selectedDate.getTime();

        filteredAnnouncements = filteredAnnouncements.filter(announcement => {
            // MODIFIED: Use created_at
            const rDate = new Date(announcement.created_at);
            rDate.setHours(0,0,0,0);
            return rDate.getTime() === selectedTime;
        });
    }

    // Filter by status (select.filter-select)
    const statusFilter = document.querySelector('#dashboard select.filter-select');
    if (statusFilter && statusFilter.value && statusFilter.value !== 'All Status' && statusFilter.value !== 'Select Status') {
        const lowerStatus = statusFilter.value.toLowerCase();
        filteredAnnouncements = filteredAnnouncements.filter(announcement => 
            (announcement.status || '').toLowerCase() === lowerStatus
        );
    }
    
    // Update display
    renderDashboardAnnouncements(filteredAnnouncements, userBarangayCache); // Renamed function, added userBarangayCache
}