/*
================================================================================
Notification Logic (notification.js) - Updated
================================================================================
*/

// ==============================
// State Management
// ==============================
const notifState = {
    notifications: [],
    // Stores unique keys "ID_TIMESTAMP" of read items
    readKeys: new Set(), 
    // Stores unique keys "ID_TIMESTAMP" of pushed items
    pushedKeys: new Set(),
    userBarangay: null,
    isLoading: true,
    prefs: {
        pushScheduled: false,
        pushUnscheduled: false
    }
};

// ==============================
// Initialization
// ==============================
document.addEventListener('DOMContentLoaded', () => {
    injectNotificationStyles(); 

    const container = document.getElementById('notifications-container');
    if (container) {
        initializeNotifications();
    }
});

async function initializeNotifications() {
    const container = document.getElementById('notifications-container');
    container.innerHTML = `<div style="padding:20px; text-align:center; color:#666;">Loading notifications...</div>`;

    loadLocalState();

    const supabaseReady = await waitForSupabase();
    if (!supabaseReady) {
        renderError("System offline. Please check connection.");
        return;
    }

    // ============================================================
    // FIX: GUEST GUARD
    // Check if user is authenticated before proceeding.
    // ============================================================
    const { data: { user } } = await window.supabase.auth.getUser();
    
    if (!user) {
        // User is a Guest. Clear container (remove "Loading...") and STOP.
        container.innerHTML = `
            <div style="padding:20px; text-align:center; color:#666;">
                <span class="material-symbols-outlined" style="font-size: 2rem; color: #ccc;">lock</span>
                <p>Please log in to view notifications.</p>
            </div>
        `;
        return; 
    }
    // ============================================================

    await fetchUserContext();
    await fetchAndProcessNotifications();
    
    renderNotifications();
    setupRealtimeSubscription();
}

async function waitForSupabase() {
    let retries = 0;
    while ((!window.supabase || typeof window.supabase.from !== "function") && retries < 30) {
        await new Promise(r => setTimeout(r, 200));
        retries++;
    }
    return !!window.supabase;
}

// ==============================
// Data Fetching
// ==============================
async function fetchUserContext() {
    try {
        const { data: { user } } = await window.supabase.auth.getUser();
        if (user) {
            const { data: profile } = await window.supabase
                .from('profiles')
                .select('barangay')
                .eq('id', user.id)
                .single();
            
            if (profile && profile.barangay && profile.barangay !== 'Not set') {
                if (!isNaN(profile.barangay)) {
                    const { data: bData } = await window.supabase
                        .from('barangays')
                        .select('name')
                        .eq('id', profile.barangay)
                        .single();
                    if(bData) notifState.userBarangay = bData.name;
                } else {
                    notifState.userBarangay = profile.barangay;
                }
            }
        }
    } catch (err) {
        console.warn("Error fetching user context:", err);
    }
}

async function fetchAndProcessNotifications() {
    try {
        // Fetch enough to cover the "12 + unread" logic
        // We sort by 'updated_at' because that represents the latest activity
        const { data, error } = await window.supabase
            .from('announcements')
            .select('*')
            .neq('status', 'Completed') 
            .neq('status', 'completed')
            .order('updated_at', { ascending: false }) 
            .limit(50);

        if (error) throw error;

        const rawData = data || [];
        
        // Map raw data to notification objects
        notifState.notifications = rawData
            .map(item => processNotificationItem(item))
            .filter(item => item !== null);

        // Trigger Pushes
        triggerPushNotifications();

    } catch (err) {
        console.error("Notification fetch error:", err);
        renderError("Failed to load notifications.");
    }
}

// ==============================
// Core Logic: Filtering & Versioning
// ==============================
function processNotificationItem(item) {
    const userLocation = notifState.userBarangay ? notifState.userBarangay.toLowerCase() : null;
    
    // 1. Relevance Check
    let isRelevant = true;
    if (userLocation) {
        const mainMatch = (item.barangay || '').toLowerCase().includes(userLocation);
        const areaMatch = Array.isArray(item.areas_affected) && 
                          item.areas_affected.some(area => area.toLowerCase().includes(userLocation));
        isRelevant = mainMatch || areaMatch;
    }

    if (!isRelevant) return null;

    // 2. Version Key Generation
    // We use the updated_at timestamp. If it changes, the Key changes.
    // This creates the "New Notification" effect for updates.
    const versionKey = `${item.id}_${item.updated_at}`;

    // 3. Read Status
    // We check if this specific VERSION has been read.
    const isRead = notifState.readKeys.has(versionKey);

    // 4. Urgent Logic (Scheduled + Future)
    const isScheduled = (item.type || '').toLowerCase() === 'scheduled';
    let isUrgent = false;
    if (isScheduled && item.scheduled_at) {
        if (new Date(item.scheduled_at) > new Date()) {
            isUrgent = true; 
        }
    }

    // 5. Determine display time
    const displayTime = item.updated_at || item.created_at;

    return {
        id: item.id,
        key: versionKey, // Unique ID for this version of the announcement
        title: generateTitle(item, isUrgent),
        message: generateMessage(item),
        timestamp: displayTime,
        isUrgent: isUrgent,
        isRead: isRead,
        type: isScheduled ? 'scheduled' : 'unscheduled'
    };
}

function generateTitle(item, isUrgent) {
    if (isUrgent) return `⚠️ Scheduled Maintenance`;
    return item.cause || 'Power Outage';
}

function generateMessage(item) {
    return `${item.status}: ${item.location || item.barangay || 'Affected Area'}. ${item.description ? item.description.substring(0, 60) + '...' : ''}`;
}

// ==============================
// UI Rendering (Smart Limit)
// ==============================
function renderNotifications() {
    const container = document.getElementById('notifications-container');
    if (!container) return;

    container.innerHTML = ''; 

    // 1. Header
    const headerEl = document.createElement('div');
    headerEl.className = 'notif-page-header';
    headerEl.innerHTML = `
        <h2 style="margin:0; font-size:1.1rem; color:#333;">Notifications</h2>
        <div class="notif-actions">
            <button id="mark-all-read-btn" class="text-btn">Mark all as read</button>
            <button id="notif-settings-btn" class="icon-btn">
                <span class="material-symbols-outlined">settings</span>
            </button>
        </div>
    `;
    container.appendChild(headerEl);

    document.getElementById('mark-all-read-btn').addEventListener('click', markAllAsRead);
    document.getElementById('notif-settings-btn').addEventListener('click', openSettingsModal);

    // 2. Sort
    // Urgent Pinned -> Date Descending.
    const sorted = [...notifState.notifications].sort((a, b) => {
        if (a.isUrgent && !b.isUrgent) return -1; 
        if (!a.isUrgent && b.isUrgent) return 1;
        return new Date(b.timestamp) - new Date(a.timestamp);
    });

    // 3. Filter: "Last 12 + Unread"
    // We show an item IF: It is within the first 12 items OR It is unread.
    const filtered = sorted.filter((n, index) => {
        if (index < 12) return true; // Always show top 12
        if (!n.isRead) return true;  // Always show unread, even if old
        return false; // Hide read items older than top 12
    });

    // 4. Render List
    if (filtered.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = `
            <span class="material-symbols-outlined">notifications_off</span>
            <p>No notifications</p>
            <p class="empty-state-detail">You're all caught up!</p>
        `;
        container.appendChild(emptyState);
        return;
    }

    const listContainer = document.createElement('div');
    listContainer.className = 'notif-list';

    listContainer.innerHTML = filtered.map(n => {
        let icon = 'bolt';
        let itemClass = `notification-card ${n.isRead ? 'read' : 'unread'}`;
        let badge = '';

        if (n.isUrgent) {
            icon = 'event'; 
            itemClass += ' urgent'; 
            badge = '<span class="badge-urgent">UPCOMING</span>';
        }

        const timeString = new Date(n.timestamp).toLocaleString([], { 
            month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' 
        });

        return `
        <div class="${itemClass}" onclick="routeToDashboard(${n.id}, '${n.key}')">
            <div class="notification-icon">
                <span class="material-symbols-outlined">${icon}</span>
            </div>
            <div class="notification-content">
                <div class="notification-header">
                    <span class="notification-title">${n.title}</span>
                    ${badge}
                </div>
                <div class="notification-detail">${n.message}</div>
                <div class="notification-time">${timeString}</div>
            </div>
            ${!n.isRead ? '<div class="unread-dot"></div>' : ''}
        </div>
        `;
    }).join('');

    container.appendChild(listContainer);
}

function renderError(msg) {
    const container = document.getElementById('notifications-container');
    if(container) container.innerHTML = `<div style="padding:20px; text-align:center; color:#e74c3c;">${msg}</div>`;
}

// ==============================
// Routing & Read Logic
// ==============================
window.routeToDashboard = function(announcementId, key) {
    // Mark THIS specific version as read
    notifState.readKeys.add(key);
    saveLocalState();
    
    window.location.href = `index.html?focus_announcement=${announcementId}`;
};

function markAllAsRead() {
    // Add ALL currently visible keys to the read set
    notifState.notifications.forEach(n => {
        notifState.readKeys.add(n.key);
        n.isRead = true;
    });
    
    saveLocalState();
    renderNotifications();
}

// ==============================
// Push Notifications
// ==============================
function triggerPushNotifications() {
    if (!notifState.userBarangay) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    notifState.notifications.forEach(notif => {
        // Use the Version Key (ID_TIMESTAMP)
        // If announcement updates -> Key changes -> not in pushedKeys -> Sends Push
        const key = notif.key;

        if (!notifState.pushedKeys.has(key)) {
            
            let shouldPush = false;

            // Respect User Preferences
            if (notif.type === 'scheduled' && notifState.prefs.pushScheduled) {
                if (!notif.isRead) shouldPush = true;
            } 
            else if (notif.type !== 'scheduled' && notifState.prefs.pushUnscheduled) {
                if (!notif.isRead) shouldPush = true;
            }

            if (shouldPush) {
                sendBrowserNotification(
                    notif.isUrgent ? `⚠️ Upcoming: ${notif.title}` : notif.title,
                    notif.message
                );
                notifState.pushedKeys.add(key);
            }
        }
    });

    savePushedState();
}

function sendBrowserNotification(title, body) {
    try {
        const n = new Notification("Beacon Alert", {
            body: body,
            icon: 'assets/icon-192.png',
            vibrate: [200, 100, 200]
        });
        n.onclick = () => {
            window.focus();
            window.location.href = 'index.html';
        };
    } catch (e) { console.warn("Push failed", e); }
}

// ==============================
// Settings & Opt-In Logic
// ==============================
function openSettingsModal() {
    const existing = document.getElementById('notif-settings-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'notif-settings-modal';
    modal.className = 'settings-popover';
    
    modal.innerHTML = `
        <div class="settings-header">
            <span>Notification Settings</span>
            <button onclick="this.closest('.settings-popover').remove()">×</button>
        </div>
        <div class="settings-body">
            <div class="setting-row">
                <div><label>Scheduled Outages</label><div class="setting-desc">Planned maintenance alerts.</div></div>
                <label class="switch"><input type="checkbox" id="toggle-scheduled" ${notifState.prefs.pushScheduled ? 'checked' : ''}><span class="slider round"></span></label>
            </div>
            <div class="setting-row">
                <div><label>Unscheduled Outages</label><div class="setting-desc">Unexpected blackout alerts.</div></div>
                <label class="switch"><input type="checkbox" id="toggle-unscheduled" ${notifState.prefs.pushUnscheduled ? 'checked' : ''}><span class="slider round"></span></label>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('toggle-scheduled').addEventListener('click', (e) => {
        handleToggleClick(e, 'pushScheduled', "Scheduled Outages", "Receive alerts for planned maintenance works.");
    });
    document.getElementById('toggle-unscheduled').addEventListener('click', (e) => {
        handleToggleClick(e, 'pushUnscheduled', "Unscheduled Outages", "Receive alerts for unexpected power interruptions.");
    });
}

function handleToggleClick(event, prefKey, title, desc) {
    event.preventDefault(); 
    const isTurningOn = !notifState.prefs[prefKey]; 

    const explanationModal = document.createElement('div');
    explanationModal.className = 'modal-overlay active';
    explanationModal.style.zIndex = '20002'; 
    
    const actionText = isTurningOn ? "Enable" : "Disable";
    const buttonColor = isTurningOn ? "#f1c40f" : "#eee";
    const buttonTextColor = isTurningOn ? "#333" : "#333";

    explanationModal.innerHTML = `
        <div class="modal" style="max-width:320px; border-radius:12px; padding:20px; text-align:center;">
            <h3 style="margin:0 0 10px 0;">${actionText} ${title}?</h3>
            <p style="color:#666; font-size:0.9rem; margin-bottom:20px; line-height:1.5;">${desc}</p>
            <div style="display:flex; gap:10px; justify-content:center;">
                <button id="cancel-opt" style="padding:10px 20px; border:none; background:#f5f5f5; border-radius:8px; cursor:pointer;">Cancel</button>
                <button id="confirm-opt" style="padding:10px 20px; border:none; background:${buttonColor}; color:${buttonTextColor}; font-weight:600; border-radius:8px; cursor:pointer;">${actionText}</button>
            </div>
        </div>
    `;

    document.body.appendChild(explanationModal);

    document.getElementById('cancel-opt').onclick = () => explanationModal.remove();
    document.getElementById('confirm-opt').onclick = async () => {
        explanationModal.remove();
        
        if (isTurningOn) {
            if ('Notification' in window) {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    applyPreferenceChange(prefKey, true);
                } else {
                    alert("Browser notification permission is required.");
                }
            }
        } else {
            applyPreferenceChange(prefKey, false);
        }
    };
}

function applyPreferenceChange(key, value) {
    notifState.prefs[key] = value;
    saveLocalState();
    const toggle = document.querySelector(`#toggle-${key === 'pushScheduled' ? 'scheduled' : 'unscheduled'}`);
    if (toggle) toggle.checked = value;
}

// ==============================
// Storage Management
// ==============================
function loadLocalState() {
    try {
        const read = JSON.parse(localStorage.getItem('beacon_read_keys') || '[]');
        const pushed = JSON.parse(localStorage.getItem('beacon_pushed_keys') || '[]');
        const prefs = JSON.parse(localStorage.getItem('beacon_notif_prefs') || null);
        
        notifState.readKeys = new Set(read);
        notifState.pushedKeys = new Set(pushed);
        if (prefs) notifState.prefs = prefs;
    } catch (e) {
        console.warn("Local state error", e);
    }
}

function saveLocalState() {
    localStorage.setItem('beacon_read_keys', JSON.stringify([...notifState.readKeys]));
    localStorage.setItem('beacon_notif_prefs', JSON.stringify(notifState.prefs));
}

function savePushedState() {
    localStorage.setItem('beacon_pushed_keys', JSON.stringify([...notifState.pushedKeys]));
}

// ==============================
// Realtime
// ==============================
function setupRealtimeSubscription() {
    window.supabase
        .channel('public:announcements')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, 
        () => {
            fetchAndProcessNotifications().then(() => renderNotifications());
        })
        .subscribe();
}

// ==============================
// Styles
// ==============================
function injectNotificationStyles() {
    const css = `
        #notification-modal-overlay { display: none; }
        #notification-modal-overlay.active { display: flex; }
        #notifications-container { padding-bottom: 80px; }
        .notif-page-header { display: flex; justify-content: space-between; align-items: center; padding: 16px; background: #fff; border-bottom: 1px solid #eee; position: sticky; top: 0; z-index: 100; }
        .notif-actions { display: flex; align-items: center; gap: 12px; }
        .text-btn { background: none; border: none; color: #007bff; font-weight: 600; font-size: 0.85rem; cursor: pointer; }
        .icon-btn { background: none; border: none; color: #555; cursor: pointer; display: flex; align-items: center; }
        .settings-popover { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 320px; background: white; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); z-index: 20000; border: 1px solid #eee; animation: popIn 0.2s ease-out; }
        @keyframes popIn { from { opacity:0; transform:translate(-50%, -40%); } to { opacity:1; transform:translate(-50%, -50%); } }
        .settings-header { background: #f8f9fa; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; font-weight: 600; color: #333; border-bottom: 1px solid #eee; }
        .settings-header button { background:none; border:none; font-size:1.2rem; cursor:pointer; }
        .settings-body { padding: 16px; }
        .setting-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; font-size: 0.9rem; color: #333; }
        .setting-desc { font-size: 0.75rem; color: #888; margin-top: 4px; max-width: 200px; line-height: 1.3; }
        .switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 34px; }
        .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .slider { background-color: #f1c40f; }
        input:checked + .slider:before { transform: translateX(20px); }
        .notification-card { display: flex; gap: 12px; padding: 16px; background: #fff; border-bottom: 1px solid #eee; cursor: pointer; position: relative; transition: background 0.2s; }
        .notification-card:hover { background: #f9f9f9; }
        .notification-card.unread { background: #fffdf0; } 
        .notification-card.urgent { background: #fff5f5; border-left: 4px solid #e74c3c; }
        .notification-icon { padding-top: 2px; color: #f1c40f; }
        .notification-card.urgent .notification-icon { color: #e74c3c; }
        .notification-card.read .notification-icon { color: #bdc3c7; }
        .notification-content { flex: 1; }
        .notification-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
        .notification-title { font-weight: 600; color: #333; font-size: 0.95rem; }
        .notification-card.read .notification-title { color: #7f8c8d; font-weight: 500; }
        .badge-urgent { background: #e74c3c; color: white; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; font-weight: 700; }
        .notification-detail { font-size: 0.85rem; color: #666; margin-bottom: 6px; line-height: 1.4; }
        .notification-time { font-size: 0.75rem; color: #999; }
        .unread-dot { width: 8px; height: 8px; background: #f1c40f; border-radius: 50%; position: absolute; top: 16px; right: 16px; }
        /* Modal style override */
        .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; }
        .modal { background: white; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
}