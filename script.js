// Global Variables
let currentUser = null;
let reports = [];
let notifications = [];
let pendingReports = [];
let currentDate = new Date();
let currentMonth = currentDate.getMonth();
let currentYear = currentDate.getFullYear();

// Sample Data
const sampleReports = [
    {
        id: 1,
        feeder: "Feeder 12",
        area: "Camp 7",
        status: "ongoing",
        startTime: "2025-10-27T06:52:00",
        cause: "Damaged transformer",
        affectedAreas: ["Camp 7", "Hillside", "Senta Escolatisca"],
        eta: "2025-10-27T09:25:00",
        image: null,
        description: "Emergency power interruption due to damaged DT fuse cut-out"
    },
    {
        id: 2,
        feeder: "Feeder 8",
        area: "Bakakeng",
        status: "reported",
        startTime: "2025-10-26T08:15:00",
        cause: "Fallen tree on power lines",
        affectedAreas: ["Bakakeng Central", "Crystal Cave"],
        eta: null,
        image: null,
        description: "Tree fell on power lines during storm"
    },
    {
        id: 3,
        feeder: "Feeder 15",
        area: "Crystal Cave",
        status: "completed",
        startTime: "2025-10-25T14:30:00",
        cause: "Scheduled maintenance",
        affectedAreas: ["Crystal Cave Proper"],
        eta: "2025-10-25T17:00:00",
        image: null,
        description: "Regular maintenance work"
    }
];

const sampleNotifications = [
    {
        id: 1,
        type: "maintenance",
        icon: "power",
        title: "Scheduled Maintenance - Feeder 12",
        detail: "Power will be interrupted on Sep 18 from 9 AM to 3 PM for maintenance.",
        time: "2 hours ago",
        fullDetail: {
            title: "BENECO POWER SERVICE ADVISORY",
            subtitle: "Emergency Power Interruption",
            date: "Monday, October 27, 2025",
            timeStarted: "06:52 AM",
            restorationEstimate: "3 HRS",
            timeRestored: "09:25 AM",
            purpose: "Replacement of damaged DT fuse cut-out",
            affectedAreas: "BAGUIO CITY: Parts of Bakakeng Central (Crystal Cave)",
            message: "Thank you for your patience and usual cooperation.",
            image: null
        }
    },
    {
        id: 2,
        type: "outage",
        icon: "warning",
        title: "Emergency Outage - Feeder 8",
        detail: "Unexpected power interruption due to damaged transformer.",
        time: "1 day ago",
        fullDetail: null
    },
    {
        id: 3,
        type: "info",
        icon: "info",
        title: "System Update",
        detail: "Our outage reporting system has been upgraded with new features.",
        time: "3 days ago",
        fullDetail: null
    }
];

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // Initialize profile click handlers
    initializeProfileActions();

    // Add profile menu to each page
    addProfileMenuToPage();

    // Load reports from storage (admin posts). If none exists, start empty so dashboard shows no reports.
    try {
        const savedReports = localStorage.getItem('reports');
        reports = savedReports ? JSON.parse(savedReports) : [];
    } catch (e) {
        reports = [];
        console.error('Failed to load reports from storage:', e);
    }

    // Load pending reports (user-submitted, awaiting admin approval)
    try {
        const savedPending = localStorage.getItem('pendingReports');
        pendingReports = savedPending ? JSON.parse(savedPending) : [];
    } catch (e) {
        pendingReports = [];
        console.error('Failed to load pending reports from storage:', e);
    }

    // Notifications can have sample data for demo; keep as default if none in storage
    try {
        const savedNotifications = localStorage.getItem('notifications');
        notifications = savedNotifications ? JSON.parse(savedNotifications) : [...sampleNotifications];
    } catch (e) {
        notifications = [...sampleNotifications];
        console.error('Failed to load notifications from storage:', e);
    }
    
    // Initialize navigation
    initializeNavigation();
    
    // Initialize page-specific functionality
    initializePage();
    
    // Check if user is logged in
    checkAuthStatus();
    
    // Register service worker
    registerServiceWorker();
}

// Navigation Functions
function initializeNavigation() {
    // Mobile bottom navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const pageId = this.getAttribute('data-page');
            navigateToPage(pageId);
        });
    });
    
    // Desktop sidebar navigation
    const desktopNavItems = document.querySelectorAll('.desktop-nav-item');
    desktopNavItems.forEach(item => {
        item.addEventListener('click', function() {
            const pageId = this.getAttribute('data-page');
            navigateToPage(pageId);
        });
    });
}

function navigateToPage(pageId) {
    // Update navigation active states
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    document.querySelectorAll('.desktop-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Activate the correct navigation item
    const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (navItem) navItem.classList.add('active');
    
    const desktopNavItem = document.querySelector(`.desktop-nav-item[data-page="${pageId}"]`);
    if (desktopNavItem) desktopNavItem.classList.add('active');
    
    // For multi-page apps, we would redirect to the actual HTML file
    // For SPA implementation, we would show/hide sections
    console.log(`Navigating to: ${pageId}`);
}

function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show selected page
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
    }
}

// Page Initialization
function initializePage() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    
    switch(currentPage) {
        case 'index.html':
            initializeDashboard();
            break;
        case 'calendar.html':
            initializeCalendar();
            break;
        case 'map.html':
            initializeMap();
            break;
        case 'report.html':
            initializeReport();
            break;
        case 'notification.html':
            initializeNotifications();
            break;
        case 'login.html':
            initializeLogin();
            break;
        case 'register.html':
            initializeRegister();
            break;
        case 'information.html':
            initializeInformation();
            break;
    }
}

// Dashboard Functions
function initializeDashboard() {
    loadDashboardReports();
    
    // Search functionality
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            filterReports(e.target.value);
        });
    }
    
    // Filter functionality
    const filterSelects = document.querySelectorAll('.filter-select');
    filterSelects.forEach(select => {
        select.addEventListener('change', function() {
            filterReports();
        });
    });
}

function loadDashboardReports() {
    const container = document.getElementById('reports-container');
    if (!container) return;
    
    if (reports.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">power_off</span>
                <p>No outage reports available</p>
                <p class="empty-state-detail">Reports will appear here when admins post updates</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = reports.map(report => `
        <div class="report-card" onclick="viewReportDetail(${report.id})">
            <div class="report-header">
                <div class="feeder-info">${report.feeder} | ${report.area}</div>
                <div class="status status-${report.status}">${formatStatus(report.status)}</div>
            </div>
            <div class="report-image">
                <span class="material-symbols-outlined">image</span>
            </div>
            <div class="report-date">Started: ${formatDate(report.startTime)}</div>
        </div>
    `).join('');
}

function filterReports(searchTerm = '') {
    let filteredReports = [...reports];
    // If searchTerm not provided, read current search input value
    const searchInput = document.querySelector('.search-input');
    if (!searchTerm && searchInput) {
        searchTerm = searchInput.value.trim();
    }

    // Filter by search term (feeder or area)
    if (searchTerm) {
        filteredReports = filteredReports.filter(report => 
            report.feeder.toLowerCase().includes(searchTerm.toLowerCase()) ||
            report.area.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (report.description && report.description.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }

    // Filter by date input (if selected)
    const dateInput = document.querySelector('input[type="date"].filter-select');
    if (dateInput && dateInput.value) {
        // Normalize to midnight for comparison
        const selectedDate = new Date(dateInput.value);
        selectedDate.setHours(0,0,0,0);

        filteredReports = filteredReports.filter(report => {
            const rDate = new Date(report.startTime);
            rDate.setHours(0,0,0,0);
            return rDate.getTime() === selectedDate.getTime();
        });
    }

    // Filter by status (select.filter-select)
    const statusFilter = document.querySelector('select.filter-select');
    if (statusFilter && statusFilter.value && statusFilter.value !== 'All Status' && statusFilter.value !== 'Select Status') {
        filteredReports = filteredReports.filter(report => 
            report.status.toLowerCase() === statusFilter.value.toLowerCase()
        );
    }
    
    // Update display
    const container = document.getElementById('reports-container');
    if (container) {
        if (filteredReports.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-symbols-outlined">search_off</span>
                    <p>No matching reports found</p>
                </div>
            `;
        } else {
            container.innerHTML = filteredReports.map(report => `
                <div class="report-card" onclick="viewReportDetail(${report.id})">
                    <div class="report-header">
                        <div class="feeder-info">${report.feeder} | ${report.area}</div>
                        <div class="status status-${report.status}">${formatStatus(report.status)}</div>
                    </div>
                    <div class="report-image">
                        <span class="material-symbols-outlined">image</span>
                    </div>
                    <div class="report-date">Started: ${formatDate(report.startTime)}</div>
                </div>
            `).join('');
        }
    }
}

// Calendar Functions
function initializeCalendar() {
    generateCalendar(currentMonth, currentYear);
    loadDateReports(currentDate);
    
    // Month navigation
    document.getElementById('prev-month')?.addEventListener('click', function() {
        currentMonth--;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        }
        generateCalendar(currentMonth, currentYear);
    });
    
    document.getElementById('next-month')?.addEventListener('click', function() {
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        generateCalendar(currentMonth, currentYear);
    });
}

function generateCalendar(month, year) {
    const calendarDays = document.getElementById('calendar-days');
    const currentMonthElement = document.getElementById('current-month');
    
    if (!calendarDays || !currentMonthElement) return;
    
    // Update month header
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    currentMonthElement.textContent = `${monthNames[month]} ${year}`;
    
    // Clear previous calendar
    calendarDays.innerHTML = '';
    
    // Add day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day-header';
        dayElement.textContent = day;
        calendarDays.appendChild(dayElement);
    });
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Add empty days for previous month
    for (let i = 0; i < firstDay; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day other-month';
        calendarDays.appendChild(emptyDay);
    }
    
    // Add days of current month
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = day;
        
        // Check if this day has reports
        const dayDate = new Date(year, month, day);
        const dayReports = getReportsForDate(dayDate);
        
        if (dayReports.length > 0) {
            if (dayReports.length >= 3) {
                dayElement.classList.add('has-multiple-outages');
            } else {
                dayElement.classList.add('has-outages');
            }
        }
        
        // Highlight current day
        if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            dayElement.classList.add('current');
        }
        
        // Add click event
        dayElement.addEventListener('click', function() {
            selectDate(dayDate);
        });
        
        calendarDays.appendChild(dayElement);
    }
}

function selectDate(date) {
    // Update selected date styling
    document.querySelectorAll('.calendar-day').forEach(day => {
        day.classList.remove('selected');
    });
    
    // Find and select the clicked day
    const dayElements = document.querySelectorAll('.calendar-day');
    const clickedDay = Array.from(dayElements).find(day => 
        day.textContent == date.getDate() && !day.classList.contains('other-month')
    );
    
    if (clickedDay) {
        clickedDay.classList.add('selected');
    }
    
    // Load reports for selected date
    loadDateReports(date);
}

function loadDateReports(date) {
    const container = document.getElementById('date-reports-container');
    const title = document.getElementById('selected-date-title');
    
    if (!container || !title) return;
    
    // Update title
    const formattedDate = formatDate(date);
    title.textContent = `Outages for ${formattedDate}`;
    
    // Get reports for the selected date
    const dateReports = getReportsForDate(date);
    
    if (dateReports.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">event_available</span>
                <p>No outages reported for this date</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = dateReports.map(report => `
        <div class="report-card" onclick="viewReportDetail(${report.id})">
            <div class="report-header">
                <div class="feeder-info">${report.feeder} | ${report.area}</div>
                <div class="status status-${report.status}">${formatStatus(report.status)}</div>
            </div>
            <div class="report-date">Started: ${formatTime(report.startTime)}</div>
        </div>
    `).join('');
}

function getReportsForDate(date) {
    return reports.filter(report => {
        const reportDate = new Date(report.startTime);
        return reportDate.getDate() === date.getDate() &&
               reportDate.getMonth() === date.getMonth() &&
               reportDate.getFullYear() === date.getFullYear();
    });
}

// Map Functions
function initializeMap() {
    loadMapReports();
    
    // Area selector
    const areaSelector = document.getElementById('area-selector');
    if (areaSelector) {
        areaSelector.addEventListener('change', function() {
            updateMapDisplay(this.value);
        });
        // initialize display based on current selection
        updateMapDisplay(areaSelector.value);
    }
    
    // Geolocation
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                console.log('User location:', position.coords);
                // In a real app, you would update the map with user's location
            },
            function(error) {
                console.log('Geolocation error:', error);
            }
        );
    }
}

function loadMapReports() {
    const container = document.getElementById('map-reports-container');
    if (!container) return;
    
    const ongoingReports = reports.filter(report => report.status === 'ongoing');
    
    if (ongoingReports.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">map</span>
                <p>No active outages in your area</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = ongoingReports.map(report => `
        <div class="report-card" onclick="viewReportDetail(${report.id})">
            <div class="report-header">
                <div class="feeder-info">${report.feeder} | ${report.area}</div>
                <div class="status status-${report.status}">${formatStatus(report.status)}</div>
            </div>
        </div>
    `).join('');
}

function updateMapDisplay(selectedArea) {
    // In a real app, this would update the map to show the selected area
    console.log('Updating map display for:', selectedArea);
    
    // Update affected zones visibility
    document.querySelectorAll('.affected-zone').forEach(zone => {
        zone.style.display = 'none';
    });
    
    if (selectedArea === 'my-area') {
        // Show all zones for user's area
        document.querySelectorAll('.affected-zone').forEach(zone => {
            zone.style.display = 'block';
        });
    } else {
        // Show only selected feeder
        const selectedZone = document.querySelector(`.affected-zone.${selectedArea}`);
        if (selectedZone) {
            selectedZone.style.display = 'block';
        }
    }

    // Update the affected areas list below the map to correspond to selection
    const container = document.getElementById('map-reports-container');
    if (!container) return;

    // Determine which reports to show. For 'my-area' show all reports, otherwise filter by feeder name.
    let visibleReports = [];
    if (selectedArea === 'my-area') {
        // For the "All feeders" view, show active/ongoing reports
        visibleReports = reports.filter(r => r.status === 'ongoing');
    } else {
        // map 'feeder-12' -> 'Feeder 12'
        const feederName = selectedArea.startsWith('feeder-') ? ('Feeder ' + selectedArea.split('-')[1]) : selectedArea;
        visibleReports = reports.filter(r => r.feeder === feederName);
    }

    if (visibleReports.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">map</span>
                <p>No outages for the selected feeder(s)</p>
            </div>
        `;
        return;
    }

    // Render reports with date similar to index.html
    container.innerHTML = visibleReports.map(report => `
        <div class="report-card" onclick="viewReportDetail(${report.id})">
            <div class="report-header">
                <div class="feeder-info">${report.feeder} | ${report.area}</div>
                <div class="status status-${report.status}">${formatStatus(report.status)}</div>
            </div>
            <div class="report-date">Started: ${formatDate(report.startTime)}</div>
        </div>
    `).join('');
}

// Report Functions
function initializeReport() {
    loadUserReports();
    
    // Report form functionality
    initializeReportForm();
}

function loadUserReports() {
    const container = document.getElementById('user-reports-container');
    if (!container) return;
    
    // In a real app, this would fetch user's specific reports
    // Show approved reports plus the user's pending reports
    const approved = reports.slice();
    const userPending = pendingReports.filter(r => r.userId && currentUser && r.userId === currentUser.id);
    // For user's view, combine approved reports and their pending reports (mark pending)
    const userReports = approved.concat(userPending.map(r => ({ ...r })));
    
    if (userReports.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">description</span>
                <p>No previous reports</p>
                <p class="empty-state-detail">Your outage reports will appear here</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = userReports.map(report => `
        <div class="report-card" onclick="viewReportDetail(${report.id})">
            <div class="report-header">
                <div class="feeder-info">${report.feeder} | ${report.area}</div>
                <div class="status status-${report.status}">${formatStatus(report.status)}</div>
            </div>
            <div class="report-date">Reported: ${formatDate(report.startTime)}</div>
        </div>
    `).join('');
}

function initializeReportForm() {
    // Cause toggle buttons
    const causeButtons = document.querySelectorAll('.toggle-button');
    causeButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Remove active class from all buttons
            causeButtons.forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked button
            this.classList.add('active');
            // Update hidden input
            document.getElementById('selected-cause').value = this.getAttribute('data-cause');
        });
    });
    
    // Image upload
    const imageUpload = document.getElementById('image-upload');
    const imageInput = document.getElementById('image-input');
    const imagePreview = document.getElementById('image-preview');
    
    if (imageUpload && imageInput) {
        imageUpload.addEventListener('click', function() {
            imageInput.click();
        });
        
        imageUpload.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('dragover');
        });
        
        imageUpload.addEventListener('dragleave', function() {
            this.classList.remove('dragover');
        });
        
        imageUpload.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('dragover');
            handleImageUpload(e.dataTransfer.files[0]);
        });
        
        imageInput.addEventListener('change', function(e) {
            handleImageUpload(e.target.files[0]);
        });
    }
    
    // Form submission
    const submitButton = document.getElementById('submit-report');
    if (submitButton) {
        submitButton.addEventListener('click', function() {
            submitOutageReport();
        });
    }
}

function handleImageUpload(file) {
    if (!file || !file.type.startsWith('image/')) {
        alert('Please select a valid image file');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const imagePreview = document.getElementById('image-preview');
        if (imagePreview) {
            imagePreview.innerHTML = `<img src="${e.target.result}" alt="Uploaded image">`;
        }
    };
    reader.readAsDataURL(file);
}

function submitOutageReport() {
    // Validate form
    const barangay = document.getElementById('barangay-select').value;
    const outageTime = document.getElementById('outage-time').value;
    const cause = document.getElementById('selected-cause').value;
    const description = document.getElementById('outage-description').value;
    
    if (!barangay || !outageTime || !cause || !description) {
        alert('Please fill in all required fields');
        return;
    }
    
    // Check if user is logged in
    if (!currentUser) {
        alert('Please log in to submit a report');
        window.location.href = 'login.html';
        return;
    }
    
    // Create new pending report (user-submitted). Admin must approve before it appears on dashboard.
    const nextPendingId = pendingReports.length ? Math.max(...pendingReports.map(r => r.id)) + 1 : 1;
    const newPendingReport = {
        id: nextPendingId,
        feeder: `Feeder ${Math.floor(Math.random() * 20) + 1}`,
        area: document.querySelector(`#barangay-select option[value="${barangay}"]`).textContent,
        status: 'pending',
        startTime: outageTime,
        cause: cause,
        affectedAreas: [barangay],
        eta: null,
        image: null,
        description: description,
        userId: currentUser.id,
        submittedAt: new Date().toISOString()
    };

    // Save to pendingReports (awaiting admin approval)
    pendingReports.push(newPendingReport);
    savePendingToStorage();

    // Show success message
    alert('Outage report submitted and is pending admin approval.');

    // Reset form and go back to reports list (user can see their pending reports in the Report page)
    document.querySelector('form')?.reset();
    document.getElementById('image-preview').innerHTML = '';
    showPage('report');
    loadUserReports();
}

// Notification Functions
function initializeNotifications() {
    loadNotifications();
}

function loadNotifications() {
    const container = document.getElementById('notifications-container');
    if (!container) return;
    
    if (notifications.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">notifications_off</span>
                <p>No notifications</p>
                <p class="empty-state-detail">You're all caught up!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = notifications.map(notification => `
        <div class="notification-card" onclick="viewNotificationDetail(${notification.id})">
            <div class="notification-icon">
                <span class="material-symbols-outlined">${notification.icon}</span>
            </div>
            <div class="notification-content">
                <div class="notification-title">${notification.title}</div>
                <div class="notification-detail">${notification.detail}</div>
                <div class="notification-time">${notification.time}</div>
            </div>
        </div>
    `).join('');
}

function viewNotificationDetail(notificationId) {
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification || !notification.fullDetail) return;

    const overlay = document.getElementById('notification-modal-overlay');
    if (!overlay) return;

    const titleEl = overlay.querySelector('.notification-modal-title');
    const subtitleEl = overlay.querySelector('.notification-modal-subtitle');
    const contentEl = overlay.querySelector('.notification-modal-content');
    const messageEl = overlay.querySelector('.notification-modal-message');

    titleEl.textContent = notification.fullDetail.title || notification.title;
    subtitleEl.textContent = notification.fullDetail.subtitle || '';

    // Build details
    const parts = [];
    const d = notification.fullDetail;
    parts.push(`<div class="notification-detail-item"><div class="notification-detail-label">DATE:</div><div class="notification-detail-value">${d.date || '-'}</div></div>`);
    parts.push(`<div class="notification-detail-item"><div class="notification-detail-label">TIME STARTED:</div><div class="notification-detail-value">${d.timeStarted || '-'}</div></div>`);
    parts.push(`<div class="notification-detail-item"><div class="notification-detail-label">RESTORATION ETA:</div><div class="notification-detail-value">${d.restorationEstimate || 'TBD'}</div></div>`);
    if (d.timeRestored) parts.push(`<div class="notification-detail-item"><div class="notification-detail-label">TIME RESTORED:</div><div class="notification-detail-value">${d.timeRestored}</div></div>`);
    parts.push(`<div class="notification-detail-item"><div class="notification-detail-label">PURPOSE:</div><div class="notification-detail-value">${d.purpose || '-'}</div></div>`);
    parts.push(`<div class="notification-detail-item"><div class="notification-detail-label">AREAS AFFECTED:</div><div class="notification-detail-value">${d.affectedAreas || '-'}</div></div>`);

    contentEl.innerHTML = parts.join('');
    messageEl.innerHTML = `<p>${d.message || ''}</p>`;

    overlay.classList.add('active');

    // close on overlay click
    overlay.addEventListener('click', function onOverlayClick(e) {
        if (e.target === overlay) {
            closeNotificationModal();
            overlay.removeEventListener('click', onOverlayClick);
        }
    });
}

function closeNotificationModal() {
    const overlay = document.getElementById('notification-modal-overlay');
    if (overlay) overlay.classList.remove('active');
}

function adminCreateNotification(data) {
    const nextId = notifications.length ? Math.max(...notifications.map(n => n.id)) + 1 : 1;
    const icons = { maintenance: 'power', outage: 'warning', info: 'info' };
    const notif = {
        id: nextId,
        type: data.type || 'info',
        icon: icons[data.type] || 'info',
        title: data.title || 'Notification',
        detail: data.detail || '',
        time: data.time || 'Just now',
        fullDetail: data.fullDetail || null
    };
    notifications.unshift(notif);
    try { localStorage.setItem('notifications', JSON.stringify(notifications)); } catch (e) {}
    // refresh UI if on notifications page
    try { loadNotifications(); } catch (e) {}
    return notif;
}

// Login Functions
function initializeLogin() {
    const loginButton = document.getElementById('login-button');
    if (loginButton) {
        loginButton.addEventListener('click', function() {
            loginUser();
        });
    }
}

function loginUser() {
    const identifier = document.getElementById('login-identifier').value;
    const password = document.getElementById('login-password').value;
    
    if (!identifier || !password) {
        alert('Please enter both email/mobile and password');
        return;
    }
    
    // In a real app, this would make an API call
    // For demo, we'll simulate successful login
    currentUser = {
        id: 1,
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
        mobile: '+1234567890'
    };
    
    // Save to localStorage
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    // Redirect to dashboard
    window.location.href = 'index.html';
}

function continueAsGuest() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}

// Register Functions
function initializeRegister() {
    const registerButton = document.getElementById('register-button');
    if (registerButton) {
        registerButton.addEventListener('click', function() {
            registerUser();
        });
    }
    
    const verifyOtpButton = document.getElementById('verify-otp');
    if (verifyOtpButton) {
        verifyOtpButton.addEventListener('click', function() {
            verifyOtp();
        });
    }
}

function registerUser() {
    const firstName = document.getElementById('first-name').value;
    const lastName = document.getElementById('last-name').value;
    const mobile = document.getElementById('mobile-number').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const terms = document.getElementById('terms').checked;
    
    // Validation
    if (!firstName || !lastName || !mobile || !email || !password || !confirmPassword) {
        alert('Please fill in all required fields');
        return;
    }
    
    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }
    
    if (!terms) {
        alert('Please accept the Terms and Conditions');
        return;
    }
    
    // In a real app, this would make an API call to register
    // For demo, we'll simulate OTP verification
    document.getElementById('otp-section').style.display = 'block';
    alert('OTP sent to your email. Please check and enter the code.');
}

function verifyOtp() {
    const otp = document.getElementById('otp-input').value;
    
    if (!otp) {
        alert('Please enter the OTP');
        return;
    }
    
    // In a real app, this would verify the OTP with the server
    // For demo, we'll assume any OTP is valid
    currentUser = {
        id: 1,
        firstName: document.getElementById('first-name').value,
        lastName: document.getElementById('last-name').value,
        email: document.getElementById('email').value,
        mobile: document.getElementById('mobile-number').value
    };
    
    // Save to localStorage
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    // Redirect to dashboard
    window.location.href = 'index.html';
}

// Information Page Functions
function initializeInformation() {
    // This would typically load specific report data based on URL parameters
    // For demo, we'll use the first report
    if (reports.length > 0) {
        displayReportInfo(reports[0]);
    }
}

function displayReportInfo(report) {
    // Update the information page with report details
    document.querySelector('.feeder-info').textContent = `${report.feeder} | ${report.area}`;
    document.querySelector('.status').textContent = formatStatus(report.status);
    document.querySelector('.status').className = `status status-${report.status}`;
    document.querySelector('.affected-areas').textContent = report.affectedAreas.join(', ');
    
    const startTime = new Date(report.startTime);
    document.querySelectorAll('.info-detail')[0].querySelector('span:last-child').textContent = 
        `${formatTime(report.startTime)}, ${formatDate(report.startTime)}`;
    
    document.querySelectorAll('.info-detail')[1].querySelector('span:last-child').textContent = report.cause;
    document.querySelectorAll('.info-detail')[2].querySelector('span:last-child').textContent = formatStatus(report.status);
    
    if (report.eta) {
        document.querySelectorAll('.info-detail')[3].querySelector('span:last-child').textContent = 
            `${formatTime(report.eta)} (${calculateTimeRemaining(report.startTime, report.eta)})`;
    } else {
        document.querySelectorAll('.info-detail')[3].querySelector('span:last-child').textContent = 'To be determined';
    }
}

function viewReportDetail(reportId) {
    // Navigate to information page with the specific report
    window.location.href = `information.html?report=${reportId}`;
}

// Utility Functions
function formatStatus(status) {
    return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        month: '2-digit', 
        day: '2-digit', 
        year: 'numeric' 
    });
}

function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
}

function calculateTimeRemaining(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end - start;
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHrs > 0) {
        return `${diffHrs} hour${diffHrs > 1 ? 's' : ''} ${diffMins > 0 ? diffMins + ' minutes' : ''}`;
    } else {
        return `${diffMins} minutes`;
    }
}

function checkAuthStatus() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
    }
}

// Service Worker Registration
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
        .then(function(registration) {
            console.log('Service Worker registered with scope:', registration.scope);
        })
        .catch(function(error) {
            console.log('Service Worker registration failed:', error);
        });
    }
}

// Profile Menu Functions
function initializeProfileActions() {
    const profileIcon = document.querySelector('.profile-icon');
    const editProfileButton = document.querySelector('.edit-profile');

    if (profileIcon) {
        profileIcon.addEventListener('click', toggleProfileMenu);
    }

    if (editProfileButton) {
        editProfileButton.addEventListener('click', function(e) {
            e.preventDefault();
            editUserProfile();
        });
    }

    // Close profile menu when clicking outside
    document.addEventListener('click', function(e) {
        const profileMenu = document.querySelector('.profile-menu');
        const profileIcon = document.querySelector('.profile-icon');
        
        if (profileMenu && 
            !profileMenu.contains(e.target) && 
            !profileIcon.contains(e.target)) {
            profileMenu.classList.remove('active');
        }
    });
}

function addProfileMenuToPage() {
    // Create profile menu element
    const profileMenu = document.createElement('div');
    profileMenu.className = 'profile-menu';

    const userInitials = currentUser ? `${currentUser.firstName[0]}${currentUser.lastName[0]}` : 'G';
    const userName = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Guest User';
    const userEmail = currentUser ? currentUser.email : 'Not logged in';

    profileMenu.innerHTML = `
        <div class="profile-menu-header">
            <h3>${userName}</h3>
            <p>${userEmail}</p>
        </div>
        <div class="profile-menu-items">
            ${currentUser ? `
                <div class="profile-menu-item" onclick="editUserProfile()">
                    <span class="material-symbols-outlined">account_circle</span>
                    Edit Profile
                </div>
                <div class="profile-menu-item" onclick="logout()">
                    <span class="material-symbols-outlined">logout</span>
                    Logout
                </div>
            ` : `
                <div class="profile-menu-item" onclick="window.location.href='login.html'">
                    <span class="material-symbols-outlined">login</span>
                    Login
                </div>
                <div class="profile-menu-item" onclick="window.location.href='register.html'">
                    <span class="material-symbols-outlined">person_add</span>
                    Register
                </div>
            `}
        </div>
    `;

    // Add to document
    document.body.appendChild(profileMenu);

    // Update profile icons with user initials
    updateProfileIcons(userInitials);

    // Add edit profile modal markup so it's available on all pages
    if (!document.getElementById('profile-modal-overlay')) {
        const profileModalHtml = document.createElement('div');
        profileModalHtml.className = 'modal-overlay';
        profileModalHtml.id = 'profile-modal-overlay';
        profileModalHtml.innerHTML = `
            <div class="notification-modal profile-modal" role="dialog" aria-modal="true" aria-label="Edit Profile">
                <button class="modal-close" aria-label="Close" onclick="closeProfileModal()">
                    <span class="material-symbols-outlined">close</span>
                </button>
                <div class="notification-modal-header">
                    <div class="notification-modal-title">Edit Profile</div>
                </div>
                <div class="notification-modal-content">
                    <!-- Names are read-only for security / identity reasons -->
                    <div class="form-group">
                        <label class="form-label">Name</label>
                        <div id="profile-name" style="padding:10px 12px; background:#fafafa; border-radius:8px; border:1px solid #eee;
                            color:var(--text);"></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Email</label>
                        <input id="profile-email" class="form-input" type="email" placeholder="you@example.com">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Mobile</label>
                        <input id="profile-mobile" class="form-input" type="tel" placeholder="0917xxxxxxx">
                    </div>
                    <div style="display:flex; gap:8px; margin-top:12px;">
                        <button id="save-profile-button" class="submit-button">Save</button>
                        <button class="submit-button" type="button" onclick="closeProfileModal()" style="background:#eee;color:var(--text);">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(profileModalHtml);

        // Hook save button
        document.getElementById('save-profile-button').addEventListener('click', function (e) {
            e.preventDefault();
            saveUserProfile();
        });
    }

    // OTP modal for verifying email/mobile changes
    if (!document.getElementById('profile-otp-overlay')) {
        const otpOverlay = document.createElement('div');
        otpOverlay.className = 'modal-overlay';
        otpOverlay.id = 'profile-otp-overlay';
        otpOverlay.innerHTML = `
            <div class="notification-modal" role="dialog" aria-modal="true" aria-label="Verify OTP">
                <button class="modal-close" aria-label="Close" onclick="closeOtpModal()">
                    <span class="material-symbols-outlined">close</span>
                </button>
                <div class="notification-modal-header">
                    <div class="notification-modal-title">Confirm Changes</div>
                    <div class="notification-modal-subtitle">Enter the OTP sent to your new email or mobile</div>
                </div>
                <div class="notification-modal-content">
                    <div class="form-group">
                        <label class="form-label">Enter OTP</label>
                        <input id="profile-otp-input" class="form-input" type="text" placeholder="6-digit code">
                    </div>
                    <div style="display:flex; gap:8px; margin-top:12px;">
                        <button id="verify-otp-button" class="submit-button">Verify</button>
                        <button id="resend-otp-button" class="submit-button" type="button" style="background:#eee;color:var(--text);">Resend</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(otpOverlay);

        document.getElementById('verify-otp-button').addEventListener('click', function (e) {
            e.preventDefault();
            verifyProfileOtp();
        });

        document.getElementById('resend-otp-button').addEventListener('click', function (e) {
            e.preventDefault();
            resendProfileOtp();
        });
    }
}

function updateProfileIcons(initials) {
    const profileIcons = document.querySelectorAll('.profile-icon');
    profileIcons.forEach(icon => {
        icon.textContent = initials;
    });

    const userAvatar = document.querySelector('.user-avatar');
    if (userAvatar) {
        userAvatar.textContent = initials;
    }

    const userInfo = document.querySelector('.user-info h3');
    if (userInfo) {
        userInfo.textContent = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Guest User';
    }
}

function toggleProfileMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    const profileMenu = document.querySelector('.profile-menu');
    profileMenu.classList.toggle('active');
}

function editUserProfile() {
    // Only allow editing when logged in
    if (!currentUser) {
        alert('Please log in to edit your profile');
        window.location.href = 'login.html';
        return;
    }

    // Open profile modal and populate fields
    const overlay = document.getElementById('profile-modal-overlay');
    if (!overlay) return;

    // Name is read-only; show as text
    const nameEl = document.getElementById('profile-name');
    if (nameEl) nameEl.textContent = `${currentUser.firstName || ''} ${currentUser.lastName || ''}`;

    document.getElementById('profile-email').value = currentUser.email || '';
    document.getElementById('profile-mobile').value = currentUser.mobile || '';

    overlay.classList.add('active');
}

function saveUserProfile() {
    // Only allow saving when logged in (should already be true)
    if (!currentUser) {
        alert('Please log in to save profile changes');
        return;
    }

    const email = document.getElementById('profile-email').value.trim();
    const mobile = document.getElementById('profile-mobile').value.trim();

    // Determine what changed
    const changed = {};
    if (email !== (currentUser.email || '')) changed.email = email;
    if (mobile !== (currentUser.mobile || '')) changed.mobile = mobile;

    if (Object.keys(changed).length === 0) {
        // Nothing changed
        alert('No changes detected');
        closeProfileModal();
        return;
    }

    // Start OTP flow to confirm the change(s)
    // Save pending update and send simulated OTP
    window.pendingProfileUpdate = { userId: currentUser.id, changes: changed };
    sendProfileOtp(changed);
}

function sendProfileOtp(changes) {
    // Simulate sending OTP to the new contact(s). We'll generate a 6-digit code.
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    window.profileOtpCode = code;

    // For demo, we'll show the code in an alert — in production you'd send via email/SMS.
    const targets = [];
    if (changes.email) targets.push(`email: ${changes.email}`);
    if (changes.mobile) targets.push(`mobile: ${changes.mobile}`);

    alert(`OTP sent to ${targets.join(' and ')}. (Demo code: ${code})`);

    // Open OTP modal
    const otpOverlay = document.getElementById('profile-otp-overlay');
    if (otpOverlay) otpOverlay.classList.add('active');
}

function verifyProfileOtp() {
    const input = document.getElementById('profile-otp-input').value.trim();
    if (!input) {
        alert('Please enter the OTP');
        return;
    }

    if (input === window.profileOtpCode) {
        // Apply pending changes
        const pending = window.pendingProfileUpdate;
        if (pending && pending.changes) {
            if (pending.changes.email) currentUser.email = pending.changes.email;
            if (pending.changes.mobile) currentUser.mobile = pending.changes.mobile;

            try { localStorage.setItem('currentUser', JSON.stringify(currentUser)); } catch (e) { console.error(e); }

            // Update UI
            const initials = `${currentUser.firstName[0] || 'G'}${currentUser.lastName[0] || ''}`.toUpperCase();
            updateProfileIcons(initials);
            const profileMenuHeader = document.querySelector('.profile-menu-header');
            if (profileMenuHeader) {
                const h3 = profileMenuHeader.querySelector('h3');
                const p = profileMenuHeader.querySelector('p');
                if (h3) h3.textContent = `${currentUser.firstName} ${currentUser.lastName}`;
                if (p) p.textContent = currentUser.email || 'Not logged in';
            }

            delete window.pendingProfileUpdate;
            delete window.profileOtpCode;

            closeOtpModal();
            closeProfileModal();
            alert('Profile updated successfully');
            return;
        }
    }

    alert('Invalid OTP. Please try again or resend.');
    // end verifyProfileOtp
}

function resendProfileOtp() {
    if (!window.pendingProfileUpdate) {
        alert('No pending changes to verify');
        return;
    }
    sendProfileOtp(window.pendingProfileUpdate.changes);
}

function closeOtpModal() {
    const overlay = document.getElementById('profile-otp-overlay');
    if (overlay) overlay.classList.remove('active');
}
function closeProfileModal() {
    const overlay = document.getElementById('profile-modal-overlay');
    if (overlay) overlay.classList.remove('active');
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
}

// Export functions for global use
window.showPage = showPage;
window.viewReportDetail = viewReportDetail;
window.viewNotificationDetail = viewNotificationDetail;
window.continueAsGuest = continueAsGuest;
window.logout = logout;
window.editUserProfile = editUserProfile;

// Persist reports to localStorage and helper functions for admin posting
function saveReportsToStorage() {
    try {
        localStorage.setItem('reports', JSON.stringify(reports));
    } catch (e) {
        console.error('Failed to save reports to storage:', e);
    }
}

function savePendingToStorage() {
    try {
        localStorage.setItem('pendingReports', JSON.stringify(pendingReports));
    } catch (e) {
        console.error('Failed to save pending reports to storage:', e);
    }
}

/**
 * adminPostReport(reportData)
 * reportData: { feeder, area, status, startTime, cause, affectedAreas, eta, image, description }
 * This is a simple helper for admins (or for use in the console) to create a report
 * and refresh all views. Reports are saved to localStorage so they persist across reloads.
 */
function adminPostReport(reportData = {}) {
    const nextId = reports.length ? Math.max(...reports.map(r => r.id)) + 1 : 1;
    const newReport = {
        id: nextId,
        feeder: reportData.feeder || `Feeder ${Math.floor(Math.random() * 20) + 1}`,
        area: reportData.area || 'Unknown Area',
        status: reportData.status || 'reported',
        startTime: reportData.startTime || new Date().toISOString(),
        cause: reportData.cause || '',
        affectedAreas: reportData.affectedAreas || [],
        eta: reportData.eta || null,
        image: reportData.image || null,
        description: reportData.description || ''
    };

    reports.push(newReport);
    saveReportsToStorage();

    // Refresh views that depend on reports
    try { loadDashboardReports(); } catch (e) { console.error(e); }
    try { generateCalendar(currentMonth, currentYear); } catch (e) { /* calendar may not exist on this page */ }
    try { loadMapReports(); } catch (e) { /* map may not exist on this page */ }
    try { loadUserReports(); } catch (e) { /* report page may not exist */ }

    return newReport;
}

// Expose admin helper to window (so you can run adminPostReport(...) from browser console)
window.adminPostReport = adminPostReport;

// Optional: small helper to clear all reports (for testing/admin)
function clearAllReports() {
    reports = [];
    saveReportsToStorage();
    try { loadDashboardReports(); } catch (e) {}
}
window.clearAllReports = clearAllReports;

// Admin approval workflow
function listPendingReports() {
    return pendingReports.slice();
}

function adminApproveReport(pendingId) {
    const index = pendingReports.findIndex(r => r.id === pendingId);
    if (index === -1) return null;

    const pending = pendingReports[index];

    // Move to approved reports
    // Give it a new id in the approved reports space to avoid id collisions
    const newId = reports.length ? Math.max(...reports.map(r => r.id)) + 1 : 1;
    const approvedReport = { ...pending, id: newId, status: pending.status === 'pending' ? 'reported' : pending.status };
    reports.push(approvedReport);
    saveReportsToStorage();

    // Remove from pending
    pendingReports.splice(index, 1);
    savePendingToStorage();

    // Refresh UI
    try { loadDashboardReports(); } catch (e) {}
    try { loadUserReports(); } catch (e) {}
    try { generateCalendar(currentMonth, currentYear); } catch (e) {}

    return approvedReport;
}

function adminRejectReport(pendingId) {
    const index = pendingReports.findIndex(r => r.id === pendingId);
    if (index === -1) return false;

    // Optionally, you could persist rejected reports elsewhere or notify the user
    pendingReports.splice(index, 1);
    savePendingToStorage();

    try { loadUserReports(); } catch (e) {}

    return true;
}

window.listPendingReports = listPendingReports;
window.adminApproveReport = adminApproveReport;
window.adminRejectReport = adminRejectReport;