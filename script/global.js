// ==============================
// Supabase Initialization
// ==============================
const SUPABASE_URL = 'https://ziuteulziywsangbnkgn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppdXRldWx6aXl3c2FuZ2Jua2duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NjQ4NDQsImV4cCI6MjA3NzQ0MDg0NH0.X2LkaDdouutbHWzotkMNEIdoJBfB9v1CtMQ7KZTXilk'; // replace with real key

// ==========================
// GLOBAL VARIABLES
// ==========================
let currentUser = null;
let reports = [];
let notifications = [];
let pendingReports = [];

// ==============================
// NEW: Custom Alert Function
// ==============================
/**
 * Displays a custom, non-blocking alert modal instead of window.alert().
 * @param {string} message The message to display.
 */
function showGlobalAlert(message) {
    // Remove existing
    const existing = document.getElementById('global-alert-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'global-alert-overlay';
    overlay.className = 'modal-overlay active';
    overlay.style.zIndex = '100005'; // HIGHEST PRIORITY (Alerts)

    overlay.innerHTML = `
        <style>
            #global-alert-modal {
                background: white;
                padding: 2rem;
                border-radius: 8px;
                width: 90%;
                max-width: 400px;
                box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                text-align: center;
            }
            #global-alert-modal p {
                margin-bottom: 1.5rem;
                font-size: 1.1rem;
                line-height: 1.5;
                color: #333;
                word-wrap: break-word;
            }
            #global-alert-modal button {
                padding: 0.5rem 1.5rem;
                border: none;
                border-radius: 4px;
                background-color: #f1c40f; /* Primary color */
                color: #333;
                cursor: pointer;
                font-size: 1rem;
                font-weight: 600;
            }
        </style>
        <div id="global-alert-modal">
            <p>${message}</p>
            <button id="global-alert-close" class="button-primary">OK</button>
        </div>
    `;
    
    document.body.appendChild(overlay);

    const closeBtn = document.getElementById('global-alert-close');
    
    // Close function
    const closeAlert = () => {
        if(overlay.parentElement) {
            overlay.remove();
        }
    };

    if (closeBtn) {
        closeBtn.addEventListener('click', closeAlert);
    }
    
    overlay.addEventListener('click', (e) => {
        if (e.target.id === 'global-alert-overlay') {
            closeAlert();
        }
    });
}

// ==============================
// MOVED FROM DASHBOARD: Confirmation Popup
// ==============================
function showConfirmationPopup(message, isError = false) {
  // Remove existing popups
  document.querySelectorAll(".confirmation-popup").forEach(p => p.remove());

  const popup = document.createElement("div");
  popup.classList.add("confirmation-popup");
  const borderColor = isError ? "#e74c3c" : "#f1c40f"; // Red for error, yellow for success

  popup.innerHTML = `
    <div class="popup-box" style="border:2px solid ${borderColor};background:#fff;padding:20px;border-radius:12px;max-width:300px;text-align:center;position:relative;">
      <button class="popup-close" style="position:absolute;top:8px;right:8px;background:none;border:none;font-size:18px;cursor:pointer;">×</button>
      <p style="margin:20px 0;font-weight:bold;">${message}</p>
    </div>`;
  popup.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.4);display:flex;justify-content:center;align-items:center;z-index:100000; /* Very High */
  `;
  document.body.appendChild(popup);

  const closeBtn = popup.querySelector(".popup-close");
  if(closeBtn) closeBtn.addEventListener('click', () => popup.remove());
  
  // Also close by clicking background
  popup.addEventListener('click', (e) => {
    if (e.target === popup) popup.remove();
  });
  
  setTimeout(() => {
    if (document.body.contains(popup)) {
        popup.remove();
    }
  }, 2500);
}


// ==============================
// Normalize Supabase User Data (FIXED)
// ==============================
/**
 * Merges Auth user data and Profile data into one consistent object.
 */
function normalizeUserData(user, profile) {
    if (!user) return null;
    
    // Auth data is the baseline
    const normalized = {
        id: user.id,
        email: user.email || '',
        // Get name from profile first, fallback to auth metadata
        firstName: profile?.first_name || user.user_metadata?.first_name || '',
        lastName: profile?.last_name || user.user_metadata?.last_name || '',
        // Get mobile and barangay from profile
        mobile: profile?.mobile || user.user_metadata?.mobile || '',
        barangay: profile?.barangay || 'Not set',
        // ADDED: Profile picture
        profile_picture: profile?.profile_picture || null 
    };

    // Ensure names are not null/undefined
    normalized.firstName = normalized.firstName || '';
    normalized.lastName = normalized.lastName || '';
    
    return normalized;
}

// ==========================
// AUTH STATE MANAGEMENT (SINGLE SOURCE OF TRUTH)
// ==========================

/**
 * Get the current auth state from localStorage
 * Returns: { user: object|null, isGuest: boolean }
 */
function getAuthState() {
    const savedUser = localStorage.getItem('currentUser');
    const isGuest = localStorage.getItem('guest') === 'true';
    
    let user = null;
    if (savedUser) {
        try {
            user = JSON.parse(savedUser);
        } catch (e) {
            console.warn('Failed to parse saved user:', e);
            localStorage.removeItem('currentUser');
        }
    }
    
    return { user, isGuest };
}

// ==========================
// PROFILE DISPLAY (FIXED)
// ==========================

/**
 * Update ALL profile displays based on current auth state
 */
function updateAllProfileDisplays() {
    const authState = getAuthState();
    const { user, isGuest } = authState;
    
    // Determine display values
    let userInitials, userName, userRole, avatarContent;
    
    if (user) {
        // Logged in user - USE THE ACTUAL USER DATA
        userInitials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'U';
        userName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        
        // FIXED: Use initials as default, then check for profile picture
        avatarContent = userInitials; 
        if (user.profile_picture) {
            avatarContent = `<img src="${user.profile_picture}" alt="Profile" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        }
        
        // If no name is available, use email username as fallback
        if (!userName || userName === ' ') {
            userName = user.email?.split('@')[0] || 'User';
        }
        userRole = 'User';
    } else if (isGuest) {
        // Guest user
        userInitials = 'G';
        userName = 'Guest User';
        userRole = 'Guest';
        avatarContent = 'G';
    } else {
        // Not logged in
        userInitials = '?';
        userName = 'Please Login';
        userRole = 'Visitor';
        avatarContent = '?';
    }

    // Update top-right profile icons
    document.querySelectorAll('.profile-icon').forEach(icon => {
        icon.innerHTML = avatarContent; // Use innerHTML to support img tag
    });

    // FIXED: Update left sidebar user profile with exact selectors
    const userAvatar = document.querySelector('.user-avatar');
    const userNameElement = document.querySelector('.user-info h3');
    const userRoleElement = document.querySelector('.user-info p');

    if (userAvatar) {
        userAvatar.innerHTML = avatarContent; // Use innerHTML
    }
    
    if (userNameElement) {
        userNameElement.textContent = userName;
    }
    
    if (userRoleElement) {
        userRoleElement.textContent = userRole;
    }

    // Also update the edit profile button behavior
    const editProfileBtn = document.querySelector('.edit-profile');
    if (editProfileBtn) {
        if (user) {
            editProfileBtn.textContent = 'Edit Profile';
            editProfileBtn.onclick = (e) => {
                e.preventDefault();
                handleEditProfile(); 
            };
        } else if (isGuest) {
            editProfileBtn.textContent = 'Login to Edit';
            editProfileBtn.onclick = (e) => {
                e.preventDefault();
                window.location.href = 'login.html';
            };
        } else {
            editProfileBtn.textContent = 'Login';
            editProfileBtn.onclick = (e) => {
                e.preventDefault();
                window.location.href = 'login.html';
            };
        }
    }
}


/**
 * Set the auth state in localStorage and update currentUser
 */
function setAuthState(user, isGuest = false) {
    if (user) {
        currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
        localStorage.removeItem('guest');
    } else if (isGuest) {
        currentUser = null;
        localStorage.removeItem('currentUser');
        localStorage.setItem('guest', 'true');
    } else {
        currentUser = null;
        localStorage.removeItem('currentUser');
        localStorage.removeItem('guest');
    }
    // Auto-refresh the UI when auth state changes
    updateAllProfileDisplays();
    renderProfileMenu();
}

/**
 * Clear all auth state
 */
function clearAuthState() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    localStorage.removeItem('guest');
}

// Update the renderProfileMenu to be consistent
function renderProfileMenu() {
    // Remove existing menu
    const existingMenu = document.querySelector('.profile-menu');
    if (existingMenu) existingMenu.remove();

    const authState = getAuthState();
    const { user, isGuest } = authState;
    
    const profileMenu = document.createElement('div');
    profileMenu.className = 'profile-menu';

    // Use the same logic as updateAllProfileDisplays
    let userName, userEmail;
    
    if (user) {
        userName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        if (!userName || userName === ' ') {
            userName = user.email?.split('@')[0] || 'User';
        }
        userEmail = user.email || 'No email';
    } else if (isGuest) {
        userName = 'Guest User';
        userEmail = 'Guest Mode';
    } else {
        userName = 'Please Login';
        userEmail = 'Not logged in';
    }

    let menuItems = '';
    
    if (user) {
        menuItems = `
            <div class="profile-menu-item" onclick="handleEditProfile()">
                <span class="material-symbols-outlined">account_circle</span> Edit Profile
            </div>
            <div class="profile-menu-item" onclick="logout()">
                <span class="material-symbols-outlined">logout</span> Logout
            </div>
        `;
    } else if (isGuest) {
        menuItems = `
            <div class="profile-menu-item" onclick="window.location.href='login.html'">
                <span class="material-symbols-outlined">login</span> Login
            </div>
            <div class="profile-menu-item" onclick="logout()">
                <span class="material-symbols-outlined">logout</span> Exit Guest Mode
            </div>
        `;
    } else {
        menuItems = `
            <div class="profile-menu-item" onclick="window.location.href='login.html'">
                <span class="material-symbols-outlined">login</span> Login
            </div>
            <div class="profile-menu-item" onclick="window.location.href='register.html'">
                <span class="material-symbols-outlined">person_add</span> Register
            </div>
        `;
    }

    profileMenu.innerHTML = `
        <div class="profile-menu-header">
            <h3>${userName}</h3>
            <p>${userEmail}</p>
        </div>
        <div class="profile-menu-items">
            ${menuItems}
        </div>
    `;
    
    document.body.appendChild(profileMenu);
}

/**
 * Handle edit profile click (FIXED)
 */
function handleEditProfile() {
    const authState = getAuthState();
    const { user, isGuest } = authState;
    
    if (user) {
        // Logged in user - show edit profile modal
        showProfileModal(); // FIXED: Call the correct new function
    } else {
        // Guest or not logged in - redirect to login
        if (isGuest) {
            showGlobalAlert('Please login to edit your profile'); // Use new alert
        }
        window.location.href = 'login.html';
    }
}


/**
 * Toggle profile menu visibility
 */
function toggleProfileMenu(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const profileMenu = document.querySelector('.profile-menu');
    if (profileMenu) profileMenu.classList.toggle('active');
}

/**
 * Initialize profile action listeners
 */
function initializeProfileActions() {
    // Profile icon click
    const profileIcon = document.querySelector('.profile-icon');
    if (profileIcon) {
        profileIcon.addEventListener('click', toggleProfileMenu);
    }

    // Left sidebar edit profile button
    const editProfileBtn = document.querySelector('.edit-profile');
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', function(e) {
            e.preventDefault();
            handleEditProfile();
        });
    }

    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
        const profileMenu = document.querySelector('.profile-menu');
        const profileIcon = document.querySelector('.profile-icon');
        
        if (profileMenu && profileIcon && 
            !profileMenu.contains(e.target) && 
            !profileIcon.contains(e.target)) {
            profileMenu.classList.remove('active');
        }
    });
}

// ==========================
// SUPABASE INITIALIZATION
// ==========================
async function initSupabase() {
    if (SUPABASE_URL.includes('<') || SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY')) {
        console.error('❗️ Supabase keys not configured. Please add your key to global.js');
        showGlobalAlert('Application is not configured. Please contact support.');
        return;
    }

    try {
        const module = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
        const { createClient } = module;
        window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase initialized');

        // Check for existing Supabase session
        try {
            const { data } = await window.supabase.auth.getSession();
            const session = data?.session;
            
            if (session?.user) {
                // User is logged in via Supabase - sync with our state
                // Fetch profile to merge with auth data
                const { data: profileData, error } = await window.supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();
                    
                if (error) console.warn("Could not fetch profile on init:", error.message);

                const userData = normalizeUserData(session.user, profileData);
                setAuthState(userData, false);
                console.log('User authenticated via Supabase and profile synced');
            } else {
                // No Supabase session - respect our existing localStorage state
                console.log('No Supabase session found');
            }
        } catch (e) {
            console.warn('Supabase session check failed:', e);
        }
        
    } catch (e) {
        console.warn('Supabase initialization failed:', e);
    }
}

// ==========================
// AUTHENTICATION FUNCTIONS
// ==========================

function initializeLogin() {
    const loginButton = document.getElementById('login-button');
    const guestButton = document.getElementById('guest-button');

    if (loginButton) loginButton.addEventListener('click', loginUser);
    if (guestButton) guestButton.addEventListener('click', function(e) { 
        e.preventDefault(); 
        continueAsGuest(); 
    });
}

async function loginUser(e) {
    if (e) e.preventDefault();
    
    if (!window.supabase) {
         showGlobalAlert('Application is not configured. Please contact support.');
         return;
    }
    
    const identifier = document.getElementById('login-identifier')?.value.trim() || '';
    const password = document.getElementById('login-password')?.value || '';
    
    if (!identifier || !password) { 
        showGlobalAlert('Please enter both email and password'); // Use new alert
        return; 
    }

    // Try Supabase login
    try {
        const { data, error } = await window.supabase.auth.signInWithPassword({ 
            email: identifier, 
            password 
        });
        
        if (error) { 
            showGlobalAlert('Login failed: ' + error.message); // Use new alert
            return; 
        }
        
        const user = data?.user;
        if (!user) {
             showGlobalAlert('Login failed. Please try again.'); // Use new alert
             return;
        }

        // --- FETCH PROFILE ON LOGIN ---
        const { data: profileData, error: profileError } = await window.supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (profileError) {
            console.warn('Could not fetch profile on login:', profileError.message);
            // Still log them in, but profile data might be incomplete
        }
        
        const userData = normalizeUserData(user, profileData);
        
        setAuthState(userData, false);
        window.location.href = 'index.html';
        return;
        
    } catch (err) { 
        console.error('Supabase login error:', err); 
        showGlobalAlert('An unexpected error occurred: ' + err.message);
    }
}

function continueAsGuest() {
    setAuthState(null, true);
    window.location.href = 'index.html';
}

function logout() {
    // Sign out from Supabase if available
    if (window.supabase?.auth?.signOut) {
        window.supabase.auth.signOut();
    }
    
    clearAuthState();
    window.location.href = 'login.html';
}

// ==========================
// APP INITIALIZATION (SIMPLIFIED)
// ==========================

document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    // Step 1: Initialize auth state from localStorage (pre-Supabase)
    const authState = getAuthState();
    currentUser = authState.user;
    
    // Step 2: Initialize UI
    initializeProfileActions();
    updateAllProfileDisplays(); // Initial render
    renderProfileMenu();
    
    // Step 3: Load other data
    loadLocalStorageData();
    initializeNavigation();
    
    // Step 4: Initialize Supabase (async)
    // This will check auth and might re-fetch profile, updating state
    await initSupabase();
    
    // Step 5: Re-render UI after Supabase init (in case auth state changed)
    updateAllProfileDisplays(); // Second render with Supabase data
    renderProfileMenu();
    
    // Step 6: Initialize page-specific functionality
    initializePage();
    
    // Step 7: Register service worker
    registerServiceWorker();
}

// ==========================
// UTILITY FUNCTIONS
// ==========================

function loadLocalStorageData() {
    try { reports = JSON.parse(localStorage.getItem('reports')) || []; } catch(e){ reports = []; }
    try { pendingReports = JSON.parse(localStorage.getItem('pendingReports')) || []; } catch(e){ pendingReports = []; }
    try { notifications = JSON.parse(localStorage.getItem('notifications')) || []; } catch(e){ notifications = []; }
}

function initializeNavigation() {
    console.log('🔍 Initializing navigation system...');
    document.querySelectorAll('.nav-item, .desktop-nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            console.log('🖱️ Navigation item clicked:', {
                element: this,
                hasHref: !!this.getAttribute('href'),
                dataPage: this.getAttribute('data-page'),
                className: this.className
            });
            
            if (this.getAttribute('href')) {
                console.log('➡️ Item has href, allowing default navigation');
                return;
            }
            
            const pageId = this.getAttribute('data-page');
            console.log('📄 Page ID from data-page:', pageId);
            
            if (pageId) {
                console.log('🚀 Calling navigateToPage with:', pageId);
                navigateToPage(pageId);
            } else {
                console.warn('⚠️ No data-page attribute found on clicked element');
            }
        });
    });
}

function navigateToPage(pageId) {
    console.log('🧭 navigateToPage called with pageId:', pageId);
    
    // Map page IDs to actual URLs
    const pageMap = {
        'dashboard': 'index.html',
        'calendar': 'calendar.html',
        'map': 'map.html',
        'report': 'report.html',
        'notification': 'notification.html'
    };
    
    const targetUrl = pageMap[pageId];
    console.log('🗺️ Page mapping:', { pageId, targetUrl });
    
    if (targetUrl) {
        console.log('📍 Navigating to:', targetUrl);
        window.location.href = targetUrl;
    } else {
        console.error('❌ No URL mapping found for pageId:', pageId);
        // Fallback: just update active state
        document.querySelectorAll('.nav-item, .desktop-nav-item').forEach(i => i.classList.remove('active'));
        const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
        const desktopNavItem = document.querySelector(`.desktop-nav-item[data-page="${pageId}"]`);
        if (navItem) navItem.classList.add('active');
        if (desktopNavItem) desktopNavItem.classList.add('active');
    }
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    const targetPage = document.getElementById(pageId);
    if (targetPage) targetPage.classList.add('active');
}

function initializePage() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const pageFunction = 'initialize' + currentPage.replace('.html', '');
    if (typeof window[pageFunction] === 'function') {
        window[pageFunction]();
    }
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.warn('Service Worker failed:', err));
    }
}

// ========================================================
// === NEW: PROFILE MODAL FUNCTIONS (FIXED) ===
// ========================================================

// Store the file selected for avatar upload
let stagedAvatarFile = null;

// 1. FORCE EXPORT GLOBALLY so the "X" button can find it
window.closeProfileModal = function() {
    const overlay = document.getElementById('profile-modal-overlay');
    if (overlay) overlay.remove();
    stagedAvatarFile = null; 
    console.log("✅ Modal closed.");
};

/**
 * Creates and displays the user profile editing modal.
 */
async function showProfileModal() {
    console.log("🚀 Opening Profile Modal...");
    stagedAvatarFile = null; 
    let profile = {}; 
    
    // Remove existing
    const existing = document.getElementById('profile-modal-overlay');
    if (existing) existing.remove();

    try {
        if (!window.supabase) {
            console.error("❌ Supabase not initialized");
            return;
        }

        const { data: { user } } = await window.supabase.auth.getUser();
        if (!user) {
            showConfirmationPopup("⚠️ Please log in to edit your profile", true);
            return;
        }

        // Fetch Profile
        const { data: profileData, error: profileError } = await window.supabase
            .from('profiles')
            .select('first_name, last_name, mobile, profile_picture, barangay') 
            .eq('id', user.id)
            .single();

        profile = profileData || {}; 
        const avatarSrc = profile.profile_picture || 'https://placehold.co/100x100/f1c40f/333?text=Profile';
        
        // Fetch Barangays
        let barangayOptions = '';
        try {
            const { data: barangaysData } = await window.supabase
                .from('barangays')
                .select('name')
                .order('name');
            barangayOptions = (barangaysData || []).map(b => `<option value="${b.name}"></option>`).join('');
        } catch (err) { console.error("Error fetching barangays:", err); }

        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'profile-modal-overlay';
        overlay.className = 'modal-overlay active';
        
        // --- NUCLEAR FIX: Z-Index Stacking ---
        // Profile Modal is 99000. Confirm modal must be higher (99999).
        overlay.style.cssText = "z-index: 99000 !important; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center;";

        overlay.innerHTML = `
            <style>
                #profile-modal-overlay .modal {
                    width: 90%; max-width: 450px;
                    background: white; border-radius: 12px;
                    border: 2px solid #f1c40f;
                    position: relative; 
                    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                    display: flex; flex-direction: column;
                    max-height: 85vh; /* Reduced height to ensure fit on mobile */
                }
                .modal-header { 
                    display: flex; justify-content: space-between; align-items: center; 
                    padding: 15px; border-bottom: 1px solid #eee; 
                    flex-shrink: 0; /* Don't shrink header */
                }
                .modal-body { 
                    padding: 15px; overflow-y: auto; flex: 1; 
                }
                .modal-actions { 
                    padding: 15px; border-top: 1px solid #eee; text-align: right; 
                    flex-shrink: 0; /* Don't shrink footer */
                    background: white; /* Ensure non-transparent */
                    border-radius: 0 0 10px 10px;
                }
                
                /* Switch Styles */
                .switch { position: relative; display: inline-block; width: 50px; height: 28px; margin-right: 8px; }
                .switch input { opacity: 0; width: 0; height: 0; }
                .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 28px; }
                .slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 4px; bottom: 4px; background-color: white; transition: .4s; border-radius: 50%; }
                input:checked + .slider { background-color: #f1c40f; }
                input:checked + .slider:before { transform: translateX(22px); }
            </style>

            <div class="modal">
                <div class="modal-header">
                    <h2 style="margin: 0; font-size: 1.2em;">Edit Profile</h2>
                    <!-- DIRECT CLICK HANDLER for 'X' -->
                    <button type="button" onclick="window.closeProfileModal()" style="background:none; border:none; font-size: 28px; cursor:pointer; color: #555; padding: 0 5px;">&times;</button>
                </div>
                
                <div class="modal-body">
                    <div style="display: flex; flex-direction: column; align-items: center; margin-bottom: 16px;">
                        <img id="profile-image-circle" src="${avatarSrc}" alt="Profile" 
                             style="width: 100px; height: 100px; border-radius: 50%; border: 3px solid #f1c40f; cursor: pointer; object-fit: cover;">
                        <input type="file" id="profile-image-input" accept="image/*" style="display: none;">
                        <button id="update-image-btn" type="button" style="background: none; border: none; color: #f1c40f; font-weight: 600; cursor: pointer; padding: 8px;">Update Image</button>
                    </div>

                    <label style="display: block; margin-bottom: 5px; font-weight: 500;">Email</label>
                    <input type="email" value="${user.email || ''}" disabled style="width: 100%; padding: 10px; margin-bottom: 10px; background: #f4f4f4; border: 1px solid #ddd; border-radius: 6px;">
                    
                    <label>First Name</label>
                    <input type="text" id="profile-first-name" value="${profile.first_name || ''}" style="width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ccc; border-radius: 6px;">

                    <label>Last Name</label>
                    <input type="text" id="profile-last-name" value="${profile.last_name || ''}" style="width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ccc; border-radius: 6px;">

                    <label>Mobile</label>
                    <input type="tel" id="profile-mobile" value="${profile.mobile || ''}" style="width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ccc; border-radius: 6px;">
                    
                    <label>Location (Barangay)</label>
                    <input type="text" id="profile-barangay" list="barangay-list" value="${profile.barangay || ''}" style="width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ccc; border-radius: 6px;">
                    <datalist id="barangay-list">${barangayOptions}</datalist>

                    <div style="margin-top: 15px;">
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <label class="switch">
                                <input type="checkbox" id="toggle-password-update">
                                <span class="slider"></span>
                            </label>
                            Update Password
                        </label>
                        <div id="password-update-section" style="display: none; margin-top: 10px; padding: 10px; background: #f9f9f9; border-radius: 6px;">
                            <input type="password" id="profile-new-password" placeholder="New Password" style="width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ccc; border-radius: 6px;">
                            <input type="password" id="profile-confirm-password" placeholder="Confirm Password" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px;">
                        </div>
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button type="button" onclick="window.closeProfileModal()" style="margin-right: 10px; padding: 10px 20px; background: #eee; border: none; border-radius: 6px; cursor: pointer;">Cancel</button>
                    <button id="save-profile" type="button" style="padding: 10px 20px; background: #f1c40f; color: #333; font-weight: bold; border: none; border-radius: 6px; cursor: pointer;">Save Changes</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // --- ATTACH LISTENERS WITH DELAY (Ensures DOM is ready) ---
        setTimeout(() => {
            console.log("🛠️ Attaching event listeners...");
            
            // Image Upload
            const imgInput = document.getElementById('profile-image-input');
            const imgCircle = document.getElementById('profile-image-circle');
            const imgBtn = document.getElementById('update-image-btn');
            
            if(imgCircle) imgCircle.onclick = () => imgInput.click();
            if(imgBtn) imgBtn.onclick = () => imgInput.click();
            // Ensure previewProfileImage exists in your file!
            if(imgInput && typeof previewProfileImage === 'function') {
                imgInput.onchange = previewProfileImage;
            }

            // Password Toggle
            const pwToggle = document.getElementById('toggle-password-update');
            if(pwToggle) {
                pwToggle.onchange = (e) => {
                    const section = document.getElementById('password-update-section');
                    if(section) section.style.display = e.target.checked ? 'block' : 'none';
                };
            }

            // SAVE BUTTON
            const saveBtn = document.getElementById('save-profile');
            if (saveBtn) {
                saveBtn.onclick = function(e) {
                    console.log("💾 Save button clicked!");
                    e.preventDefault();
                    saveUserProfile(profile);
                };
            } else {
                console.error("❌ Save button not found!");
            }
        }, 100);

    } catch (err) {
        console.error("Error loading profile:", err);
        showConfirmationPopup(`❌ Error: ${err.message}`, true);
    }
}

/**
 * Handles previewing the selected profile image.
 */
function previewProfileImage(event) {
    const input = event.target;
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        // Basic type check
        if (!file.type.startsWith('image/')) {
            showConfirmationPopup("⚠️ Please select an image file.", true);
            return;
        }

        // Basic size check (e.g., 5MB)
        if (file.size > 5 * 1024 * 1024) {
            showConfirmationPopup("⚠️ Image is too large (Max 5MB).", true);
            return;
        }
        
        stagedAvatarFile = file; // Store the file for upload
        
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('profile-image-circle').src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}


/**
 * Gathers form data and initiates the save process
 * by asking for password confirmation.
 * @param {object} originalProfile - The original profile data fetched when modal opened.
 */
async function saveUserProfile(originalProfile) {
    const firstName = document.getElementById('profile-first-name')?.value;
    const lastName = document.getElementById('profile-last-name')?.value;
    const mobile = document.getElementById('profile-mobile')?.value;
    const barangay = document.getElementById('profile-barangay')?.value; // Added
    const newPassword = document.getElementById('profile-new-password')?.value;
    const confirmPassword = document.getElementById('profile-confirm-password')?.value;
    const isUpdatingPassword = document.getElementById('toggle-password-update')?.checked;

    const profileUpdates = {
        first_name: firstName,
        last_name: lastName,
        mobile: mobile,
        barangay: barangay // Added
    };
    
    let authUpdates = {};

    if (isUpdatingPassword) {
        if (!newPassword || newPassword.length < 6) {
            showConfirmationPopup("⚠️ New password must be at least 6 characters.", true);
            return;
        }
        if (newPassword !== confirmPassword) {
            showConfirmationPopup("⚠️ New passwords do not match.", true);
            return;
        }
        authUpdates.password = newPassword;
    }

    // Package all updates
    const allUpdates = {
        profileUpdates,
        authUpdates,
        avatarFile: stagedAvatarFile
    };

    // FIXED: Correct change detection
    if (
        profileUpdates.first_name === (originalProfile.first_name || '') &&
        profileUpdates.last_name === (originalProfile.last_name || '') &&
        profileUpdates.mobile === (originalProfile.mobile || '') &&
        profileUpdates.barangay === (originalProfile.barangay || '') && // Added
        Object.keys(authUpdates).length === 0 &&
        !stagedAvatarFile
    ) {
        showConfirmationPopup("ℹ️ No changes to save.", true); // Use 'true' to show as a warning/info
        return;
    }

    // Show the password confirmation modal
    showPasswordConfirmModal(allUpdates);
}


/**
 * Shows a second modal to confirm the user's current password
 * before applying any updates.
 * @param {object} updates - The packaged updates to perform.
 */
function showPasswordConfirmModal(updates) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'password-confirm-modal-overlay';
    overlay.className = 'modal-overlay active';
    overlay.style.zIndex = '99999'; // HIGHER THAN PROFILE MODAL (which is 99000)
    
    overlay.innerHTML = `
        <div class="modal" style="max-width: 360px; border-radius: 12px; border: 2px solid #f1c40f;">
            <div style="padding: 16px 20px; border-bottom: 1px solid #eee;">
                <h3 style="margin: 0; font-size: 1.1em;">Confirm Changes</h3>
            </div>
            
            <div class="modal-body" style="padding: 20px;">
                <p style="font-size: 0.9em; color: #333; margin: 0 0 12px 0;">
                    Please enter your current password to save your changes.
                </p>
                <label for="current-password-confirm" style="display: block; margin-bottom: 4px; font-weight: 500; font-size: 0.9em;">
                    Current Password
                </label>
                <input type="password" id="current-password-confirm" 
                       style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box;">
                <p id="confirm-error-msg" style="color: #e74c3c; font-size: 0.8em; margin: 8px 0 0 0; display: none;"></p>
            </div>
            
            <div class="modal-actions" style="padding: 16px; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 10px;">
                <button id="cancel-confirm" type="button" style="background: #eee; color: #333; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer;">
                    Cancel
                </button>
                <button id="confirm-save" style="background: #f1c40f; color: #333; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer;">
                    Confirm & Save
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const confirmBtn = document.getElementById('confirm-save');
    const cancelBtn = document.getElementById('cancel-confirm');
    const errorMsg = document.getElementById('confirm-error-msg');
    const passwordInput = document.getElementById('current-password-confirm');

    const closeConfirmModal = () => {
        if (document.body.contains(overlay)) {
            overlay.remove();
        }
    };

    cancelBtn.addEventListener('click', closeConfirmModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeConfirmModal();
    });

    confirmBtn.addEventListener('click', async () => {
        const currentPassword = passwordInput.value;
        if (!currentPassword) {
            errorMsg.textContent = "Please enter your password.";
            errorMsg.style.display = 'block';
            return;
        }

        errorMsg.style.display = 'none';
        confirmBtn.textContent = 'Saving...';
        confirmBtn.disabled = true;

        await executeProfileUpdates(currentPassword, updates, closeConfirmModal);

        confirmBtn.textContent = 'Confirm & Save';
        confirmBtn.disabled = false;
    });
}

/**
 * Executes the actual Supabase updates after password confirmation.
 * @param {string} currentPassword - The user's current password.
 * @param {object} updates - The packaged updates to perform.
 * @param {function} closeConfirmModal - Callback to close the confirmation modal.
 */
async function executeProfileUpdates(currentPassword, updates, closeConfirmModal) {
    const errorMsg = document.getElementById('confirm-error-msg');
    let newAvatarUrl = null; // Store new URL for modal update

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not found.");

        // 1. Re-authenticate user with their current password.
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: currentPassword,
        });

        if (signInError) {
            errorMsg.textContent = "Incorrect password. Please try again.";
            errorMsg.style.display = 'block';
            return;
        }

        console.log("✅ Re-authentication successful.");

        // 2. Handle Avatar Upload (if any)
        if (updates.avatarFile) {
            newAvatarUrl = await handleProfileImageUpload(updates.avatarFile, user.id);
            if (newAvatarUrl) {
                // FIXED: Use profile_picture
                updates.profileUpdates.profile_picture = newAvatarUrl; 
            }
        }

        // 3. Update Profile Table (first_name, last_name, mobile, profile_picture, barangay)
        // Also include updated_at timestamp
        updates.profileUpdates.updated_at = new Date().toISOString();

        // We use upsert here in case the profile row didn't exist yet
        // --- FIX: Use .select().single() to get the updated row back immediately ---
        const { data: upsertedProfile, error: profileUpdateError } = await supabase
            .from('profiles')
            .upsert({ ...updates.profileUpdates, id: user.id }) // Use upsert and ensure ID is set
            .select() // Ask for the updated data back
            .single(); // We only expect one row
        
        if (profileUpdateError) throw profileUpdateError;
        console.log("✅ Profile table updated.");
        

        // 4. Update Auth User (Password)
        if (updates.authUpdates.password) {
            const { error: authUpdateError } = await supabase.auth.updateUser({
                password: updates.authUpdates.password
            });

            if (authUpdateError) throw authUpdateError;
            console.log("✅ User password updated.");
        }

        // 5. Update Auth User Metadata (if names changed)
        // This keeps auth.users() in sync with profiles table for names
        const authMetaUpdates = {};
        if (updates.profileUpdates.first_name) authMetaUpdates.first_name = updates.profileUpdates.first_name;
        if (updates.profileUpdates.last_name) authMetaUpdates.last_name = updates.profileUpdates.last_name;
        
        if (Object.keys(authMetaUpdates).length > 0) {
            const { error: authMetaError } = await supabase.auth.updateUser({
                data: authMetaUpdates
            });
            if (authMetaError) throw authMetaError;
            console.log("✅ Auth user metadata updated.");
        }

        // --- REVISED: Update state and modal UI, but keep modal open ---
        showConfirmationPopup("✅ Profile updated successfully!");
        closeConfirmModal(); // Close *only* the password modal
        // FIXED: Use the new window function
        window.closeProfileModal(); // 👈 Close the main edit modal

        
        // Refresh profile displays across the app
        // Re-fetch user and profile to get ALL new data
        const { data: { user: newAuthUser }, error: authUserError } = await supabase.auth.getUser();
        if (authUserError) throw authUserError;

        // --- FIX: No need to re-fetch, we already have the new profile ---
        // const { data: newProfile, error: finalProfileError } = await supabase
        //     .from('profiles')
        //     .select('*')
        //     .eq('id', newAuthUser.id)
        //     .single();
            
        // if (finalProfileError) throw finalProfileError;

        // Normalize with the fresh data from the upsert
        const updatedLocalUser = normalizeUserData(newAuthUser, upsertedProfile);
        
        // This call updates localStorage AND all other UI elements
        setAuthState(updatedLocalUser, false); 
        
        // --- NEW: Update the image in the modal from the freshly fetched user data ---
        const modalImage = document.getElementById('profile-image-circle');
        if (modalImage) {
            // Use the definitive URL from the 'updatedLocalUser' object.
            // This ensures the modal reflects the true state of the database,
            // whether the picture was added, changed, or (if we add the feature) removed.
            modalImage.src = updatedLocalUser.profile_picture || 'https://placehold.co/100x100/f1c40f/333?text=Profile';
        }
        
        // Clear the staged file (if one existed)
        stagedAvatarFile = null; 
        // --- END OF REVISION ---


    } catch (err) {
        console.error("❌ Error saving profile:", err);
        errorMsg.textContent = `Error: ${err.message}`;
        errorMsg.style.display = 'block';
    }
}

/**
 * Handles uploading a new avatar to Supabase Storage
 * and returns the public URL.
 * @param {File} file - The image file to upload.
 * @param {string} userId - The user's ID.
 * @returns {string|null} The public URL of the uploaded image or null.
 */
async function handleProfileImageUpload(file, userId) {
    try {
        const fileExt = file.name.split('.').pop();
        // FIXED: Use profile_pictures bucket
        const filePath = `profile_pictures/${userId}/avatar-${Date.now()}.${fileExt}`; 

        const { error: uploadError } = await supabase.storage
            .from('profile_pictures') // FIXED: Use profile_pictures bucket
            .upload(filePath, file, {
                upsert: true // Overwrite if file with same name exists
            });
        
        if (uploadError) throw uploadError;

        // Get public URL
        const { data: publicUrlData } = supabase.storage
            .from('profile_pictures') // FIXED: Use profile_pictures bucket
            .getPublicUrl(filePath);
        
        if (!publicUrlData || !publicUrlData.publicUrl) {
            throw new Error("Could not get public URL for profile picture.");
        }

        console.log("✅ Profile picture uploaded:", publicUrlData.publicUrl);
        return publicUrlData.publicUrl;

    } catch (err) {
        console.error("❌ Profile picture upload failed:", err);
        showConfirmationPopup(`❌ Profile picture upload failed: ${err.message}`, true);
        return null;
    }
}

// ==========================
// GLOBAL EXPORTS (FIXED)
// ==========================
window.showPage = showPage;
window.continueAsGuest = continueAsGuest;
window.logout = logout;
// window.editUserProfile = showProfileModal; // No longer need to export this directly
window.loginUser = loginUser;
window.toggleProfileMenu = toggleProfileMenu;
window.handleEditProfile = handleEditProfile;