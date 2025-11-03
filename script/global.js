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
// Normalize Supabase User Data
// ==============================
function normalizeUserData(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return {
    id: user.id,
    email: user.email || '',
    firstName: meta.first_name || meta.firstName || '',
    lastName: meta.last_name || meta.lastName || '',
    mobile: meta.mobile || meta.phone || ''
  };
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
// PROFILE DISPLAY (FIXED WITH CORRECT SELECTORS)
// ==========================

/**
 * Update ALL profile displays based on current auth state
 */
function updateAllProfileDisplays() {
    const authState = getAuthState();
    const { user, isGuest } = authState;
    
    // Determine display values
    let userInitials, userName, userRole;
    
    if (user) {
        // Logged in user - USE THE ACTUAL USER DATA
        userInitials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'U';
        userName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
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
    } else {
        // Not logged in
        userInitials = '?';
        userName = 'Please Login';
        userRole = 'Visitor';
    }

    console.log('Updating profile with:', { userName, userInitials, userRole, currentUser: user });

    // Update top-right profile icons
    document.querySelectorAll('.profile-icon').forEach(icon => {
        icon.textContent = userInitials;
    });

    // FIXED: Update left sidebar user profile with exact selectors
    const userAvatar = document.querySelector('.user-avatar');
    const userNameElement = document.querySelector('.user-info h3');
    const userRoleElement = document.querySelector('.user-info p');

    if (userAvatar) {
        userAvatar.textContent = userInitials;
        console.log('Updated avatar to:', userInitials);
    }
    
    if (userNameElement) {
        userNameElement.textContent = userName;
        console.log('Updated name to:', userName);
    }
    
    if (userRoleElement) {
        userRoleElement.textContent = userRole;
        console.log('Updated role to:', userRole);
    }

    // Also update the edit profile button behavior
    const editProfileBtn = document.querySelector('.edit-profile');
    if (editProfileBtn) {
        if (user) {
            editProfileBtn.textContent = 'Edit Profile';
            editProfileBtn.onclick = (e) => {
                e.preventDefault();
                editUserProfile();
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
            <div class="profile-menu-item" onclick="editUserProfile()">
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
 * Handle edit profile click
 */
function handleEditProfile() {
    const authState = getAuthState();
    const { user, isGuest } = authState;
    
    if (user) {
        // Logged in user - show edit profile modal
        editUserProfile();
    } else {
        // Guest or not logged in - redirect to login
        if (isGuest) {
            alert('Please login to edit your profile');
        }
        window.location.href = 'login.html';
    }
}

/**
 * Edit user profile modal (created dynamically)
 */
function editUserProfile() {
    const authState = getAuthState();
    const user = authState.user;

    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    // Remove any existing modal before creating a new one
    const existing = document.getElementById('profile-modal-overlay');
    if (existing) existing.remove();

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'profile-modal-overlay';
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
        <div class="modal">
            <h2>Edit Profile</h2>
            <div class="modal-body">
                <p id="profile-name">${user.firstName || ''} ${user.lastName || ''}</p>
                <label>Email:</label>
                <input type="email" id="profile-email" value="${user.email || ''}">
                <label>Mobile:</label>
                <input type="text" id="profile-mobile" value="${user.mobile || ''}">
            </div>
            <div class="modal-actions">
                <button id="save-profile">Save</button>
                <button id="cancel-profile">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Button event listeners
    document.getElementById('save-profile').addEventListener('click', saveUserProfile);
    document.getElementById('cancel-profile').addEventListener('click', closeProfileModal);
}

function closeProfileModal() {
    const overlay = document.getElementById('profile-modal-overlay');
    if (overlay) overlay.remove();
}

function saveUserProfile() {
    const authState = getAuthState();
    const user = authState.user;
    if (!user) {
        alert('Please log in to save your profile.');
        return;
    }

    const updatedUser = {
        ...user,
        email: document.getElementById('profile-email')?.value || user.email,
        mobile: document.getElementById('profile-mobile')?.value || user.mobile
    };

    setAuthState(updatedUser, false);
    updateAllProfileDisplays();
    closeProfileModal();
    alert('Profile updated successfully!');
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
    if (SUPABASE_URL.includes('<') || SUPABASE_ANON_KEY.includes('<')) {
        console.log('Supabase keys not configured; using demo mode.');
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
                const userData = normalizeUserData(session.user);
                setAuthState(userData, false);
                console.log('User authenticated via Supabase');
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
    
    const identifier = document.getElementById('login-identifier')?.value.trim() || '';
    const password = document.getElementById('login-password')?.value || '';
    
    if (!identifier || !password) { 
        alert('Please enter both email and password'); 
        return; 
    }

    // Try Supabase login if available
    if (window.supabase?.auth?.signInWithPassword) {
        try {
            const { data, error } = await window.supabase.auth.signInWithPassword({ 
                email: identifier, 
                password 
            });
            
            if (error) { 
                alert('Login failed: ' + error.message); 
                return; 
            }
            
            const user = data?.user;
            const userData = normalizeUserData(user);
            
            setAuthState(userData, false);
            window.location.href = 'index.html';
            return;
            
        } catch (err) { 
            console.error('Supabase login error:', err); 
            // Fall through to demo mode
        }
    }

    // Demo mode fallback
    const userData = { 
        id: 1, 
        firstName: 'Demo', 
        lastName: 'User', 
        email: identifier, 
        mobile: '+1234567890' 
    };
    setAuthState(userData, false);
    window.location.href = 'index.html';
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
    // Step 1: Initialize auth state from localStorage
    const authState = getAuthState();
    currentUser = authState.user;
    
    // Step 2: Initialize UI
    initializeProfileActions();
    updateAllProfileDisplays();
    renderProfileMenu();
    
    // Step 3: Load other data
    loadLocalStorageData();
    initializeNavigation();
    
    // Step 4: Initialize Supabase (async)
    await initSupabase();
    
    // Step 5: Re-render UI after Supabase init (in case auth state changed)
    updateAllProfileDisplays();
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
    document.querySelectorAll('.nav-item, .desktop-nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            if (this.getAttribute('href')) return;
            const pageId = this.getAttribute('data-page');
            if (pageId) navigateToPage(pageId);
        });
    });
}

function navigateToPage(pageId) {
    document.querySelectorAll('.nav-item, .desktop-nav-item').forEach(i => i.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    const desktopNavItem = document.querySelector(`.desktop-nav-item[data-page="${pageId}"]`);
    if (navItem) navItem.classList.add('active');
    if (desktopNavItem) desktopNavItem.classList.add('active');
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

// ==========================
// GLOBAL EXPORTS
// ==========================
window.showPage = showPage;
window.continueAsGuest = continueAsGuest;
window.logout = logout;
window.editUserProfile = editUserProfile;
window.loginUser = loginUser;
window.toggleProfileMenu = toggleProfileMenu;
window.handleEditProfile = handleEditProfile;

